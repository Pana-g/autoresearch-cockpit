"""Tests for the run state machine."""

import pytest

from app.models.state_machine import (
    InvalidTransitionError,
    RunState,
    validate_transition,
)


class TestValidTransitions:
    """Test that all expected valid transitions are accepted."""

    @pytest.mark.parametrize(
        "from_state,to_state",
        [
            (RunState.IDLE, RunState.PREPARING),
            (RunState.IDLE, RunState.CANCELED),
            (RunState.PREPARING, RunState.AWAITING_AGENT),
            (RunState.PREPARING, RunState.FAILED),
            (RunState.AWAITING_AGENT, RunState.AGENT_RUNNING),
            (RunState.AWAITING_AGENT, RunState.PAUSED),
            (RunState.AGENT_RUNNING, RunState.AWAITING_PATCH_REVIEW),
            (RunState.AGENT_RUNNING, RunState.FAILED),
            (RunState.AWAITING_PATCH_REVIEW, RunState.PATCH_APPROVED),
            (RunState.AWAITING_PATCH_REVIEW, RunState.AWAITING_AGENT),
            (RunState.AWAITING_PATCH_REVIEW, RunState.CANCELED),
            (RunState.PATCH_APPROVED, RunState.TRAINING_RUNNING),
            (RunState.TRAINING_RUNNING, RunState.TRAINING_FINISHED),
            (RunState.TRAINING_RUNNING, RunState.FAILED),
            (RunState.TRAINING_FINISHED, RunState.AWAITING_NEXT_ACTION),
            (RunState.AWAITING_NEXT_ACTION, RunState.AWAITING_AGENT),
            (RunState.AWAITING_NEXT_ACTION, RunState.DONE),
            (RunState.AWAITING_NEXT_ACTION, RunState.PAUSED),
            (RunState.PAUSED, RunState.AWAITING_AGENT),
            (RunState.PAUSED, RunState.CANCELED),
        ],
    )
    def test_valid_transition(self, from_state, to_state):
        validate_transition(from_state, to_state)  # should not raise


class TestInvalidTransitions:
    """Test that invalid transitions are rejected."""

    @pytest.mark.parametrize(
        "from_state,to_state",
        [
            (RunState.IDLE, RunState.AGENT_RUNNING),
            (RunState.IDLE, RunState.TRAINING_RUNNING),
            (RunState.DONE, RunState.IDLE),
            (RunState.DONE, RunState.AWAITING_AGENT),
            (RunState.FAILED, RunState.IDLE),
            (RunState.CANCELED, RunState.AWAITING_AGENT),
            (RunState.TRAINING_RUNNING, RunState.IDLE),
            (RunState.AGENT_RUNNING, RunState.TRAINING_RUNNING),
            (RunState.PREPARING, RunState.DONE),
            (RunState.AWAITING_AGENT, RunState.DONE),
        ],
    )
    def test_invalid_transition(self, from_state, to_state):
        with pytest.raises(InvalidTransitionError):
            validate_transition(from_state, to_state)


class TestTerminalStates:
    """Terminal states (DONE, FAILED, CANCELED) have no outgoing transitions."""

    @pytest.mark.parametrize("terminal", [RunState.DONE, RunState.FAILED, RunState.CANCELED])
    def test_terminal_state_has_no_transitions(self, terminal):
        for target in RunState:
            with pytest.raises(InvalidTransitionError):
                validate_transition(terminal, target)


class TestRunStateEnum:
    def test_all_states_present_in_transitions(self):
        from app.models.state_machine import VALID_TRANSITIONS

        for state in RunState:
            assert state in VALID_TRANSITIONS, f"{state} missing from VALID_TRANSITIONS"
