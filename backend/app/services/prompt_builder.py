"""Prompt assembly for the agent wake-up."""

from app.config import settings


def build_agent_prompt(
    *,
    program_md: str,
    train_py: str,
    memory_records: list[dict],
    latest_metrics: dict | None,
    human_notes: list[str],
    iteration: int = 0,
    best_val_bpb: float | None = None,
    overfit_floor: float | None = None,
    compacted_summary: str | None = None,
    compacted_up_to: int | None = None,
    machine_info: str | None = None,
) -> list[dict]:
    """Assemble the messages list for the agent call.

    Returns OpenAI-style message list: [system, user].
    """
    system = _SYSTEM_PROMPT

    # Build the user context block
    parts = []

    # Situational awareness
    parts.append(f"## Current Status — Iteration {iteration}\n")
    if best_val_bpb is not None:
        parts.append(f"- Current best val_bpb: **{best_val_bpb:.4f}** (lower is better)\n")
    else:
        parts.append("- No baseline val_bpb yet — this is the first measurement.\n")
    if overfit_floor is not None:
        parts.append(f"- **Overfitting floor: {overfit_floor:.4f}** — any val_bpb below this will be rejected as overfitting.\n")
    parts.append(f"- Total iterations so far: {len(memory_records)}\n")
    parts.append("\n")

    # Machine hardware profile (first iteration only)
    if machine_info:
        parts.append(machine_info)
        parts.append(
            "\n**Use the hardware profile above to choose sensible initial hyperparameters** "
            "(batch size, model dimensions, number of layers, sequence length, etc.) "
            "that will fit comfortably in this machine's memory and finish training within ~5 minutes. "
            "If there is no GPU, ensure the code runs on CPU only.\n\n"
        )

    parts.append("## Program Specification (program.md)\n")
    parts.append(program_md)
    parts.append("\n")

    parts.append("## Current train.py\n```python\n")
    parts.append(train_py)
    parts.append("\n```\n")

    if memory_records:
        # If we have a compacted summary, show it for older records
        # and only list individual records after the compaction point
        if compacted_summary and compacted_up_to:
            recent_records = [r for r in memory_records if r["iteration"] > compacted_up_to]
            parts.append(compacted_summary)
            if recent_records:
                parts.append(f"## Recent Iterations (after compaction) — {len(recent_records)} entries\n")
                parts.append("**CRITICAL: Study every entry below. Do NOT repeat any approach that failed or didn't improve.**\n\n")
                failed_approaches = []
                successful_approaches = []
                for rec in recent_records:
                    bpb = rec.get("val_bpb")
                    bpb_str = f"val_bpb={bpb:.4f}" if bpb is not None else "no metric"
                    parts.append(f"- **Iteration {rec['iteration']}** [{bpb_str}]: {rec['summary']}\n")
                    if not rec.get("improved"):
                        failed_approaches.append(rec['summary'])
                    else:
                        successful_approaches.append(rec['summary'])

                if failed_approaches:
                    parts.append("\n### ❌ Recent failed approaches — DO NOT REPEAT:\n")
                    for fa in failed_approaches:
                        parts.append(f"- {fa}\n")
                if successful_approaches:
                    parts.append("\n### ✅ Recent successful approaches — build on these:\n")
                    for sa in successful_approaches:
                        parts.append(f"- {sa}\n")
                parts.append("\n")
        else:
            parts.append(f"## Run Memory — ALL {len(memory_records)} past iterations\n")
            parts.append("**CRITICAL: Study every entry below. Do NOT repeat any approach that failed or didn't improve.**\n\n")

            failed_approaches = []
            successful_approaches = []
            for rec in memory_records:
                bpb = rec.get("val_bpb")
                bpb_str = f"val_bpb={bpb:.4f}" if bpb is not None else "no metric"
                parts.append(f"- **Iteration {rec['iteration']}** [{bpb_str}]: {rec['summary']}\n")
                if not rec.get("improved"):
                    failed_approaches.append(rec['summary'])
                else:
                    successful_approaches.append(rec['summary'])

            if failed_approaches:
                parts.append("\n### ❌ Failed/Non-improving approaches — DO NOT REPEAT:\n")
                for fa in failed_approaches:
                    parts.append(f"- {fa}\n")

            if successful_approaches:
                parts.append("\n### ✅ Successful approaches — build on these:\n")
                for sa in successful_approaches:
                    parts.append(f"- {sa}\n")

            parts.append("\n")

    if latest_metrics:
        parts.append("## Latest Metrics\n")
        for k, v in latest_metrics.items():
            parts.append(f"- {k}: {v}\n")
        parts.append("\n")

    if human_notes:
        parts.append("## Human Notes & Hints\n")
        for note in human_notes:
            parts.append(f"- {note}\n")
        parts.append("\n")

    parts.append("## Your Task\n")
    parts.append(
        "Analyze the current train.py and the COMPLETE history above. "
        "You MUST try a NEW approach that has NOT been attempted in any previous iteration. "
        "If a change failed or didn't improve, do NOT try it again or a minor variation of it. "
        "Be creative and explore fundamentally different strategies. "
        "Propose a single, focused modification to improve val_bpb. "
        "Output the COMPLETE modified train.py inside a ```python code block. "
        "Before the code block, write a brief rationale explaining your change "
        "and why it differs from all previous attempts."
    )

    user_content = "".join(parts)

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


_SYSTEM_PROMPT = """You are an expert ML researcher working on neural network training optimization.

A human researcher is monitoring your work in real-time and can intervene, roll back your changes, or provide instructions at any point. You are a collaborator, not an autonomous agent.

RULES:
1. You may ONLY modify train.py. No other files.
2. Your output must contain the COMPLETE train.py in a single ```python code block.
3. Before the code block, write a brief RATIONALE (2-4 sentences) explaining what you changed and WHY this approach is different from all previous attempts.
4. Make ONE focused change per iteration. Do not change multiple things at once.
5. Your changes must produce valid, runnable Python. Test mentally that all names are defined and imports exist.
6. Focus on reducing val_bpb (validation bits-per-byte). Lower is better.
7. **NEVER repeat a failed approach.** Study the run memory carefully. If something crashed or didn't improve, try a completely different strategy.
8. Keep training time under 5 minutes. Do not dramatically increase model size or training steps.
9. Each iteration should explore a genuinely new idea. Think about: learning rate schedules, architectural changes, regularization, data preprocessing, optimizer tweaks, activation functions, initialization schemes, etc.
10. If many iterations have failed, consider making SMALLER, safer changes that are less likely to crash.

ANTI-CHEATING / INTEGRITY RULES — CRITICAL:
11. **DO NOT overfit to the validation set.** Any trick that memorizes validation data, leaks validation info into training, or games the eval metric without genuine learning improvement is FORBIDDEN.
12. **DO NOT modify the evaluation logic.** If the code contains evaluation/validation routines, do not change how val_bpb is calculated or reported.
13. **DO NOT hardcode outputs** or short-circuit training to produce artificial metrics.
14. **Genuine improvements only.** Your changes must improve the model's actual learning ability — better architectures, optimization, regularization, or data handling.
15. The human researcher will inspect your changes. If your approach appears to be gaming the metric rather than genuinely improving the model, your change will be rolled back and you will need to try a different approach.
16. **READ HUMAN NOTES CAREFULLY.** If the human has left instructions, follow them precisely. They are monitoring your work and providing corrections when needed.
"""
