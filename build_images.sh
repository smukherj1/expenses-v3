#!/usr/bin/bash

set -eu


function build_ui() {
    echo "Building expenses-ui image..."
    docker build -f expenses-ui/Dockerfile -t ghcr.io/smukherj1/expenses/expenses-ui:latest expenses-ui
}

components=("ui")

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