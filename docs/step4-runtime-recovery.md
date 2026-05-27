# Step4-D Runtime Recovery UI

## Close and error behavior

The realtime UI now separates connection states into user-facing labels:

- idle: not connected
- connecting: connecting
- connected: monitoring
- disconnected: stopped or socket closed
- error: connection error

When the socket closes, the UI shows disconnected and keeps the latest snapshot on screen.
When an error event is received, the UI shows a short error message without exposing low-level details.

## Manual recovery

Automatic reconnect is still not implemented.
For `disconnected` and `error` states, the UI enables a manual reconnect button.

Manual reconnect disposes the old runtime, creates a fresh realtime client/runtime, connects again, and subscribes again using the currently loaded REST snapshot.

## Lifecycle rules

- REST reload disposes the old runtime.
- Component unmount disposes the runtime.
- Connected and connecting states cannot start another runtime.
- Stop is safe even after close or error.
- Reconnect is available only after a snapshot is loaded and own guild ID is entered.

## Why reconnect is not automatic yet

Keeping reconnect manual avoids retry loops while the runtime behavior is still being validated.
Automatic retry can be added after close reasons, subscription failures, and UI expectations are clearer.

## Next step

The next step can add a small reconnect policy behind the runtime boundary, or improve runtime diagnostics without changing parser, normalize, merge, or Guild Battle selectors.
