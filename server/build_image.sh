#!/usr/bin/bash

set -eu

./gradlew bootBuildImage --imageName=ghcr.io/smukherj1/expenses/expenses-server:latest