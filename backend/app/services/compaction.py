"""Context compaction — reduce memory records to fit within context limits."""

import logging

logger = logging.getLogger(__name__)

# Context window sizes (tokens) by model name substring
CONTEXT_WINDOW_SIZES: dict[str, int] = {
    # OpenAI
    "gpt-4.1": 1_047_576,
    "gpt-4.1-mini": 1_047_576,
    "gpt-4.1-nano": 1_047_576,
    "o3-mini": 200_000,
    "o3": 200_000,
    "o4-mini": 200_000,
    # Anthropic
    "claude-sonnet-4-20250514": 200_000,
    "claude-3-5-haiku-20241022": 200_000,
    "claude-3-5-sonnet-20241022": 200_000,
    "claude-3-opus-20240229": 200_000,
    # Google
    "gemini-2.5-pro": 1_048_576,
    "gemini-2.5-flash": 1_048_576,
    "gemini-2.0-flash": 1_048_576,
}

DEFAULT_CONTEXT_WINDOW = 128_000


def get_context_limit(model: str, override: int = 0) -> int:
    """Get context window size for a model. Override > 0 takes precedence."""
    if override > 0:
        return override
    # Try exact match first, then substring match (longest first)
    if model in CONTEXT_WINDOW_SIZES:
        return CONTEXT_WINDOW_SIZES[model]
    for key in sorted(CONTEXT_WINDOW_SIZES, key=len, reverse=True):
        if key in model:
            return CONTEXT_WINDOW_SIZES[key]
    return DEFAULT_CONTEXT_WINDOW


def estimate_tokens(text: str) -> int:
    """Rough token estimate (4 chars ≈ 1 token)."""
    return len(text) // 4


def build_compacted_summary(
    memory_records: list[dict],
    keep_recent: int = 5,
) -> tuple[str, int]:
    """Build a compacted summary from memory records.

    Keeps the most recent `keep_recent` records as-is (they will be appended
    individually in the prompt). The rest are compressed into a structured
    summary.

    Returns: (compacted_summary_text, compacted_up_to_iteration)
    """
    if len(memory_records) <= keep_recent:
        # Nothing to compact
        return "", 0

    # Records to compact (older ones) vs keep (recent ones)
    to_compact = memory_records[:-keep_recent]
    compacted_up_to = to_compact[-1]["iteration"]

    # Gather stats
    best_bpb = None
    best_iter = None
    improved_iters = []
    failed_approaches: list[str] = []
    successful_approaches: list[str] = []

    for rec in to_compact:
        bpb = rec.get("val_bpb")
        if bpb is not None:
            if best_bpb is None or bpb < best_bpb:
                best_bpb = bpb
                best_iter = rec["iteration"]

        if rec.get("improved"):
            improved_iters.append(rec["iteration"])
            successful_approaches.append(
                f"Iteration {rec['iteration']}: {rec['summary']}"
            )
        else:
            failed_approaches.append(
                f"Iteration {rec['iteration']}: {rec['summary']}"
            )

    # Build compact text
    parts = []
    parts.append(f"## Compacted Memory (Iterations 1–{compacted_up_to})\n")
    parts.append(f"*{len(to_compact)} iterations compacted into this summary.*\n\n")

    if best_bpb is not None:
        parts.append(f"**Best val_bpb in compacted range:** {best_bpb:.4f} (iteration {best_iter})\n")
        parts.append(f"**Iterations that improved:** {', '.join(str(i) for i in improved_iters) if improved_iters else 'none'}\n\n")

    if failed_approaches:
        parts.append("### ❌ Failed/Non-improving approaches — DO NOT REPEAT:\n")
        for fa in failed_approaches:
            parts.append(f"- {fa}\n")
        parts.append("\n")

    if successful_approaches:
        parts.append("### ✅ Successful approaches — build on these:\n")
        for sa in successful_approaches:
            parts.append(f"- {sa}\n")
        parts.append("\n")

    return "".join(parts), compacted_up_to


def check_compaction_needed(
    prompt_text: str,
    model: str,
    context_limit_override: int = 0,
    threshold_pct: int = 50,
) -> tuple[bool, int, int, int]:
    """Check if the prompt exceeds the compaction threshold.

    Returns: (needed, prompt_tokens, context_limit, threshold_tokens)
    """
    context_limit = get_context_limit(model, context_limit_override)
    threshold_tokens = int(context_limit * threshold_pct / 100)
    prompt_tokens = estimate_tokens(prompt_text)

    return (
        prompt_tokens > threshold_tokens,
        prompt_tokens,
        context_limit,
        threshold_tokens,
    )
