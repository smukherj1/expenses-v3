#!/usr/bin/bash

set -eu


function build_ui() {
    echo "Building expenses-ui image..."
    (cd expenses-ui && docker build -f Dockerfile -t ghcr.io/smukherj1/expenses/expenses-ui:latest .)
}

function build_server() {
    echo "Building expenses-server image..."
    (cd server && ./build_image.sh)
}

components=("ui" "server")

if [ $# -eq 0 ]; then
    targets=("all")
else
    targets=("$@")
fi

for target in "${targets[@]}"; do
    if [ "$target" == "all" ]; then
        for component in "${components[@]}"; do
            build_${component}
        done
    else
        build_${target}
    fi
done