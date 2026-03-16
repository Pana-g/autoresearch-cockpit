import enum


class RunState(str, enum.Enum):
    IDLE = "idle"
    PREPARING = "preparing"
    AWAITING_AGENT = "awaiting_agent"
    AGENT_RUNNING = "agent_running"
    AWAITING_PATCH_REVIEW = "awaiting_patch_review"
    PATCH_APPROVED = "patch_approved"
    TRAINING_RUNNING = "training_running"
    TRAINING_FINISHED = "training_finished"
    AWAITING_NEXT_ACTION = "awaiting_next_action"
    DONE = "done"
    PAUSED = "paused"
    FAILED = "failed"
    CANCELED = "canceled"


# Allowed transitions: from_state → set of valid to_states
VALID_TRANSITIONS: dict[RunState, set[RunState]] = {
    RunState.IDLE: {RunState.PREPARING, RunState.CANCELED},
    RunState.PREPARING: {RunState.AWAITING_AGENT, RunState.FAILED, RunState.CANCELED},
    RunState.AWAITING_AGENT: {RunState.AGENT_RUNNING, RunState.PAUSED, RunState.CANCELED},
    RunState.AGENT_RUNNING: {
        RunState.AWAITING_PATCH_REVIEW,
        RunState.AWAITING_NEXT_ACTION,  # patch invalid → retry
        RunState.FAILED,
        RunState.CANCELED,
    },
    RunState.AWAITING_PATCH_REVIEW: {
        RunState.PATCH_APPROVED,
        RunState.AWAITING_AGENT,  # rejected → re-prompt
        RunState.PAUSED,
        RunState.CANCELED,
    },
    RunState.PATCH_APPROVED: {RunState.TRAINING_RUNNING, RunState.FAILED, RunState.CANCELED},
    RunState.TRAINING_RUNNING: {
        RunState.TRAINING_FINISHED,
        RunState.FAILED,
        RunState.CANCELED,
    },
    RunState.TRAINING_FINISHED: {RunState.AWAITING_NEXT_ACTION, RunState.FAILED},
    RunState.AWAITING_NEXT_ACTION: {
        RunState.AWAITING_AGENT,  # loop
        RunState.DONE,
        RunState.PAUSED,
        RunState.CANCELED,
    },
    RunState.PAUSED: {RunState.AWAITING_AGENT, RunState.CANCELED},
    RunState.DONE: {RunState.AWAITING_AGENT},
    RunState.FAILED: {RunState.PREPARING, RunState.AWAITING_AGENT},
    RunState.CANCELED: {RunState.AWAITING_AGENT},
}


class InvalidTransitionError(Exception):
    def __init__(self, current: RunState, target: RunState):
        super().__init__(f"Invalid transition: {current.value} → {target.value}")
        self.current = current
        self.target = target


def validate_transition(current: RunState, target: RunState) -> None:
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError(current, target)
