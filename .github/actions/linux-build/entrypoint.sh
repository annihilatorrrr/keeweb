#!/bin/bash -e

cd /github/workspace
npm ci
grunt --commit-sha=${COMMIT_SHA} desktop-linux
