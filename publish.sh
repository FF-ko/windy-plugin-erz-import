#!/bin/bash
#
# Publishes the built plugin to Windy's plugin server.
#
# Windy serves every plugin from windy-plugins.com — a local URL cannot be
# installed, and each upload must carry a higher version than the last.
#
# Needs a Windy Plugins API key from https://api.windy.com/keys, passed either
# in the environment or in a .secret-api-key.sh file (gitignored) containing:
#
#   WINDY_API_KEY=your-key-here
#
# Usage: ./publish.sh [--dry-run]

set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
elif [ -n "${1:-}" ]; then
    echo "Usage: ./publish.sh [--dry-run]" >&2
    exit 1
fi

if [ -z "${WINDY_API_KEY:-}" ] && [ -f .secret-api-key.sh ]; then
    # shellcheck disable=SC1091
    source .secret-api-key.sh
fi

if [ -z "${WINDY_API_KEY:-}" ] && [ "$DRY_RUN" = false ]; then
    echo "WINDY_API_KEY is not set." >&2
    echo "Create a key at https://api.windy.com/keys, then either export it or" >&2
    echo "put 'WINDY_API_KEY=your-key' into .secret-api-key.sh" >&2
    exit 1
fi

echo "Building..."
npm run build >/dev/null

VERSION=$(jq -r .version dist/plugin.json)
NAME=$(jq -r .name dist/plugin.json)
PRIVATE=$(jq -r '.private // false' dist/plugin.json)

echo "Publishing $NAME $VERSION (private: $PRIVATE)"

# Windy records where the plugin came from; absent a git checkout these stay empty.
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "")
REPOSITORY=$(git remote get-url origin 2>/dev/null || echo "")
OWNER=$(git config user.name 2>/dev/null || echo "")

if [ -z "$SHA" ]; then
    echo "Note: not a git repository, so no commit/repository info is attached."
fi

cd dist

jq --arg repositoryName "$REPOSITORY" \
   --arg commitSha "$SHA" \
   --arg repositoryOwner "$OWNER" \
   '. + {$repositoryName, $commitSha, $repositoryOwner}' \
   plugin.json > plugin-merged.json
mv plugin-merged.json plugin.json

trap 'rm -f ../plugin.tar' EXIT
tar cf ../plugin.tar .

if [ "$DRY_RUN" = true ]; then
    echo "Dry run — nothing uploaded. Archive would contain:"
    tar tf ../plugin.tar | sed 's/^/  /'
    echo "plugin.json:"
    jq . plugin.json | sed 's/^/  /'
    exit 0
fi

echo "Uploading..."
curl -s --fail-with-body -XPOST 'https://node.windy.com/plugins/v1.0/upload' \
    -H "x-windy-api-key: ${WINDY_API_KEY}" \
    -F "plugin_archive=@../plugin.tar"

echo
echo "Done. Install the plugin from the URL printed above, via"
echo "windy.com -> Menu -> Install Windy plugin -> Load plugin directly from URL."
