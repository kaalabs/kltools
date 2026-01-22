#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

PREFIX="${PREFIX:-/usr/local}"
INSTALL_DIR="${PREFIX}/lib/modelsdev"
BIN_LINK="${PREFIX}/bin/modelsdev"

if [[ -z "${TARBALL:-}" ]]; then
  mapfile -t CANDIDATES < <(ls -1 "${DIST_DIR}"/modelsdev-*.tar.* 2>/dev/null)
  if (( ${#CANDIDATES[@]} == 0 )); then
    echo "No distribution tarballs found in ${DIST_DIR}."
    exit 1
  fi

  echo "Available distributions:"
  for i in "${!CANDIDATES[@]}"; do
    printf "  %2d) %s\n" "$((i + 1))" "$(basename "${CANDIDATES[$i]}")"
  done

  while true; do
    read -r -p "Select a tarball [1-${#CANDIDATES[@]}]: " SELECTION
    if [[ "${SELECTION}" =~ ^[0-9]+$ ]] && (( SELECTION >= 1 && SELECTION <= ${#CANDIDATES[@]} )); then
      TARBALL="${CANDIDATES[$((SELECTION - 1))]}"
      break
    fi
    echo "Invalid selection."
  done
fi

case "${TARBALL}" in
  *.tar.xz) TAR_FLAGS="xJf" ;;
  *.tar.gz) TAR_FLAGS="xzf" ;;
  *)
    echo "Unsupported tarball format: ${TARBALL}"
    exit 1
    ;;
esac

if [[ ! -w "${PREFIX}" ]]; then
  SUDO="sudo"
else
  SUDO=""
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

tar -"${TAR_FLAGS}" "${TARBALL}" -C "${TMP_DIR}"

if [[ ! -d "${TMP_DIR}/modelsdev" ]]; then
  echo "Unexpected tarball layout in ${TARBALL}"
  exit 1
fi

if [[ -d "${INSTALL_DIR}" ]]; then
  BACKUP_DIR="${INSTALL_DIR}.bak-$(date +%Y%m%d%H%M%S)"
  ${SUDO} mv "${INSTALL_DIR}" "${BACKUP_DIR}"
fi

${SUDO} install -d "${INSTALL_DIR}"
${SUDO} cp -a "${TMP_DIR}/modelsdev/." "${INSTALL_DIR}"
${SUDO} install -d "$(dirname "${BIN_LINK}")"
${SUDO} ln -sf "${INSTALL_DIR}/bin/modelsdev" "${BIN_LINK}"

echo "Installed ${INSTALL_DIR}"
echo "Linked ${BIN_LINK}"
