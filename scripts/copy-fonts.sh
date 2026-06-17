#!/usr/bin/env bash
set -euo pipefail
mkdir -p public/fonts/geist-sans public/fonts/geist-mono
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 public/fonts/geist-sans/
cp node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2 public/fonts/geist-mono/
