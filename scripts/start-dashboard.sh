#!/bin/bash
# Wrapper for launchd — exec's node directly so launchd tracks the real PID.
# Using npm as ProgramArguments causes launchd to track the npm wrapper process,
# which exits immediately after spawning node, making launchd think the service crashed.
cd "$(dirname "$0")/.."
exec "$(which node)" node_modules/.bin/next start -p 3000
