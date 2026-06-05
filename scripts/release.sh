#!/usr/bin/env bash
# Paket bazlı release: package.json'ı günceller, commit atar, tag oluşturur.
# Kullanım: ./scripts/release.sh <pkg> <version>
# Örnek:    ./scripts/release.sh mcp 1.3.0
set -e

PKG=$1
VERSION=$2

if [[ -z "$PKG" || -z "$VERSION" ]]; then
  echo "Kullanım: $0 <core|server|metro-plugin|mcp> <semver>"
  exit 1
fi

VALID_PKGS="core server metro-plugin mcp"
if ! echo "$VALID_PKGS" | grep -qw "$PKG"; then
  echo "Geçersiz paket: $PKG. Geçerli değerler: $VALID_PKGS"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$ ]]; then
  echo "Geçersiz versiyon formatı: $VERSION (beklenen: semver, örn. 1.3.0 veya 1.3.0-beta.1)"
  exit 1
fi

TAG="$PKG-v$VERSION"

cd "packages/$PKG"
npm version "$VERSION" --no-git-tag-version --allow-same-version
cd ../..

git add "packages/$PKG/package.json"
git add "packages/$PKG/package-lock.json" 2>/dev/null || true
git commit -m "release($PKG): v$VERSION"
git tag "$TAG"

echo ""
echo "✓ Commit ve tag oluşturuldu: $TAG"
echo ""
echo "Yayınlamak için:"
echo "  git push && git push origin $TAG"
