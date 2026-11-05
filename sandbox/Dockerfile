# Isolated fire-time solver for Route 66 Drive-In.
# The image contains the solver sources and nothing else: no .env, no API keys,
# no order database, no Docker socket.
#
# Build from the repo root:
#   docker build -f sandbox/Dockerfile -t route66-fire-solver sandbox
#
# Run on the Vultr VM (this is the process boundary):
#   timeout 5s docker run --rm -i \
#     --network=none \
#     --read-only \
#     --cap-drop=ALL \
#     --security-opt no-new-privileges \
#     --memory=128m --memory-swap=128m \
#     --pids-limit=32 \
#     --cpus=0.50 \
#     --user node \
#     route66-fire-solver --stdin
#
# Time: `timeout 5s` kills a wedged run. The solver itself is a pure function
# and also exits if it is still waiting on stdin after SOLVER_TIMEOUT_MS
# (default 5s). 128m is enough for this script and is the memory cap the API
# passes through. Swap is pinned to the same 128m so the container cannot
# grow onto disk. No network means a hostile note cannot curl out.
#
# Do not mount the host app directory or pass `-e VULTR_INFERENCE_API_KEY`.

FROM node:22-alpine

WORKDIR /sandbox

COPY package.json /sandbox/package.json
COPY fire-time-solver/types.ts fire-time-solver/solver.ts fire-time-solver/cli.ts /sandbox/fire-time-solver/

USER node

ENTRYPOINT ["node", "--experimental-strip-types", "/sandbox/fire-time-solver/cli.ts"]
