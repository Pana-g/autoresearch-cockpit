"""Cross-platform machine hardware assessment (macOS / Linux / Windows)."""

import json
import logging
import os
import platform
import shutil
import subprocess

logger = logging.getLogger(__name__)


def get_machine_info() -> dict:
    """Return a dict describing the current machine's hardware.

    Keys: os, cpu, cpu_cores, ram_gb, gpus (list of dicts).
    Works on macOS, Linux, and Windows.
    """
    info: dict = {
        "os": f"{platform.system()} {platform.release()}",
        "arch": platform.machine(),
        "cpu": _get_cpu_name(),
        "cpu_cores": os.cpu_count() or 0,
        "ram_gb": round(_get_ram_bytes() / (1024 ** 3), 1),
        "gpus": _get_gpus(),
    }
    return info


def format_machine_info(info: dict) -> str:
    """Render machine info as a concise Markdown section for prompt injection."""
    lines = [
        "## Machine Hardware Profile",
        f"- **OS**: {info.get('os', 'unknown')} ({info.get('arch', 'unknown')})",
        f"- **CPU**: {info.get('cpu', 'unknown')} — {info.get('cpu_cores', '?')} cores",
        f"- **RAM**: {info.get('ram_gb', '?')} GB",
    ]
    gpus = info.get("gpus", [])
    if gpus:
        for i, gpu in enumerate(gpus):
            name = gpu.get("name", "unknown")
            vram = gpu.get("vram_mb")
            vram_str = f" ({vram} MB VRAM)" if vram else ""
            lines.append(f"- **GPU {i}**: {name}{vram_str}")
    else:
        lines.append("- **GPU**: none detected (CPU-only training)")
    return "\n".join(lines) + "\n"


# ── CPU ────────────────────────────────────────────────────


def _get_cpu_name() -> str:
    system = platform.system()
    try:
        if system == "Darwin":
            out = subprocess.check_output(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                text=True, timeout=5,
            ).strip()
            return out or platform.processor()
        if system == "Linux":
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
            return platform.processor()
        if system == "Windows":
            out = subprocess.check_output(
                ["wmic", "cpu", "get", "Name", "/value"],
                text=True, timeout=5,
            ).strip()
            for part in out.split("\n"):
                if part.startswith("Name="):
                    return part.split("=", 1)[1].strip()
            return platform.processor()
    except Exception:
        logger.debug("Could not detect CPU name", exc_info=True)
    return platform.processor() or "unknown"


# ── RAM ────────────────────────────────────────────────────


def _get_ram_bytes() -> int:
    system = platform.system()
    try:
        if system == "Darwin":
            out = subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"],
                text=True, timeout=5,
            ).strip()
            return int(out)
        if system == "Linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        # Value is in kB
                        return int(line.split()[1]) * 1024
        if system == "Windows":
            out = subprocess.check_output(
                ["wmic", "OS", "get", "TotalVisibleMemorySize", "/value"],
                text=True, timeout=5,
            ).strip()
            for part in out.split("\n"):
                if part.startswith("TotalVisibleMemorySize="):
                    return int(part.split("=", 1)[1].strip()) * 1024
    except Exception:
        logger.debug("Could not detect RAM", exc_info=True)
    return 0


# ── GPU ────────────────────────────────────────────────────


def _get_gpus() -> list[dict]:
    """Detect GPUs. Tries nvidia-smi first, then platform-specific fallbacks."""
    gpus = _try_nvidia_smi()
    if gpus:
        return gpus

    system = platform.system()
    if system == "Darwin":
        return _try_macos_gpu()
    if system == "Linux":
        return _try_lspci_gpu()
    if system == "Windows":
        return _try_wmic_gpu()
    return []


def _try_nvidia_smi() -> list[dict]:
    if not shutil.which("nvidia-smi"):
        return []
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            text=True, timeout=10,
        ).strip()
        gpus = []
        for line in out.split("\n"):
            if not line.strip():
                continue
            parts = line.split(",")
            name = parts[0].strip()
            vram = int(float(parts[1].strip())) if len(parts) > 1 else None
            gpus.append({"name": name, "vram_mb": vram})
        return gpus
    except Exception:
        logger.debug("nvidia-smi failed", exc_info=True)
        return []


def _try_macos_gpu() -> list[dict]:
    try:
        out = subprocess.check_output(
            ["system_profiler", "SPDisplaysDataType", "-json"],
            text=True, timeout=10,
        )
        data = json.loads(out)
        gpus = []
        for display in data.get("SPDisplaysDataType", []):
            name = display.get("sppci_model", "unknown")
            vram_str = display.get("spdisplays_vram", display.get("sppci_vram", ""))
            vram_mb = None
            if vram_str:
                # e.g. "8 GB", "16384 MB"
                parts = vram_str.split()
                if len(parts) >= 2:
                    try:
                        val = int(parts[0])
                        unit = parts[1].upper()
                        vram_mb = val * 1024 if "GB" in unit else val
                    except ValueError:
                        pass
            gpus.append({"name": name, "vram_mb": vram_mb})
        return gpus
    except Exception:
        logger.debug("macOS GPU detection failed", exc_info=True)
        return []


def _try_lspci_gpu() -> list[dict]:
    if not shutil.which("lspci"):
        return []
    try:
        out = subprocess.check_output(
            ["lspci"], text=True, timeout=10,
        )
        gpus = []
        for line in out.split("\n"):
            lower = line.lower()
            if "vga" in lower or "3d controller" in lower or "display controller" in lower:
                # Format: "XX:XX.X Description: Name"
                name = line.split(":", 2)[-1].strip() if ":" in line else line.strip()
                gpus.append({"name": name, "vram_mb": None})
        return gpus
    except Exception:
        logger.debug("lspci GPU detection failed", exc_info=True)
        return []


def _try_wmic_gpu() -> list[dict]:
    try:
        out = subprocess.check_output(
            ["wmic", "path", "win32_VideoController", "get", "Name,AdapterRAM", "/value"],
            text=True, timeout=10,
        ).strip()
        gpus = []
        current: dict = {}
        for line in out.split("\n"):
            line = line.strip()
            if line.startswith("AdapterRAM="):
                try:
                    ram_bytes = int(line.split("=", 1)[1])
                    current["vram_mb"] = ram_bytes // (1024 * 1024)
                except ValueError:
                    pass
            elif line.startswith("Name="):
                current["name"] = line.split("=", 1)[1].strip()
            elif not line and current:
                gpus.append(current)
                current = {}
        if current:
            gpus.append(current)
        return gpus
    except Exception:
        logger.debug("wmic GPU detection failed", exc_info=True)
        return []
