#!/usr/bin/bash

set -eu

./mvnw spring-boot:build-image -Dspring-boot.build-image.imageName=ghcr.io/smukherj1/expenses/expenses-server:latest