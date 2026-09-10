# AGENT.md: Strict Engineering Guidelines & Contract Specifications

## 1. Zero-Fuzzy Protocol Enforcement
1. **Never Use Fuzzy Matching on API Enums:**
   - Under no circumstances should `.contains("RUN")`, `.contains("DONE")`, `.contains("WAIT")`, `.contains("MCP")`, or similar substring heuristics be used on protocol status or type fields.
   - All server wire values from AGY Hub (`step.status`, `step.type`, `cascade.status`) MUST be mapped through strict, typed Kotlin enums using exact equality (`==`).
2. **Deterministic Status Mapping:**
   - A step's lifecycle state belongs strictly to THAT step (`step.status` and `step.requestedInteraction`).
   - The cascade-level status (`cascadeStatus`) must NEVER be used to infer, override, or flip an individual tool's status.
3. **No Guesswork on Execution State:**
   - Do not guess whether a command is finished based on whether output is blank or whether another task is running. If `step.status` has not transitioned to `CORTEX_STEP_STATUS_DONE` or `CORTEX_STEP_STATUS_ERROR`, the tool is `RUNNING`.

---

## 2. AGY Protobuf Contract Reference (`exa.language_server_pb`)

### A. Step Lifecycle Status (`step.status`)
* `CORTEX_STEP_STATUS_UNSPECIFIED`: Unknown/default state.
* `CORTEX_STEP_STATUS_PENDING`: Model has emitted the tool call; step is queued.
* `CORTEX_STEP_STATUS_RUNNING`: Tool is actively executing.
* `CORTEX_STEP_STATUS_WAITING`: Execution is paused awaiting user confirmation/permission.
* `CORTEX_STEP_STATUS_DONE`: Execution completed successfully.
* `CORTEX_STEP_STATUS_ERROR`: Execution failed or command returned non-zero.
* `CORTEX_STEP_STATUS_CANCELLED`: Step cancelled by user.

### B. Cascade Run Status (`cascade.status`)
* `CASCADE_RUN_STATUS_RUNNING`: Active turn in progress.
* `CASCADE_RUN_STATUS_WAITING_USER_INPUT`: Cascade paused awaiting user prompt or decision.
* `CASCADE_RUN_STATUS_IDLE`: Turn complete, idle and ready for user input.
* `CASCADE_RUN_STATUS_COMPLETED`: Cascade completed.
* `CASCADE_RUN_STATUS_FAILED`: Cascade encountered a fatal error.
* `CASCADE_RUN_STATUS_CANCELLED`: Entire cascade run was cancelled.

### C. Step Type (`step.type`)
* `CORTEX_STEP_TYPE_USER_INPUT`: User prompt.
* `CORTEX_STEP_TYPE_PLANNER_RESPONSE`: Model reasoning and markdown output.
* `CORTEX_STEP_TYPE_GENERIC`: Universal tool invocation (`generic.args` and `generic.result.payload`).

---

## 3. Tool Cancellation & Step Control Rules
1. **Individual Tool Termination:**
   - Cancelling an individual tool must use `CancelCascadeSteps(cascadeId, [stepIndex])`.
   - Never call `CancelCascadeInvocation` or terminate the global streaming job when stopping a single tool. Only the global chat "Stop" button may cancel the entire cascade.
2. **Numeric Step Index Authority:**
   - Step indexing must strictly follow `sourceTrajectoryStepInfo.stepIndex` (integer).
   - Never parse step indices using string splitting hacks (e.g. `substringAfterLast("_")`).
