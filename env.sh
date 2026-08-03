# Isolated toolchain for ai-job-search.
#
#   source ./env.sh        # from the repo root
#
# Everything this repo needs lives under .toolchain/ and .venv/ inside the
# repo. Nothing is installed system-wide.
#
# You normally do NOT need to source this: bun, lualatex, xelatex and tlmgr are
# symlinked into ~/.local/bin (already on PATH), because Claude Code starts each
# tool call in a fresh shell and cannot carry a sourced environment across them.
# Sourcing this additionally activates the Python venv and prints a doctor line.
#
# To remove everything again:
#
#   rm -rf .toolchain .venv
#   rm -f ~/.local/bin/{bun,lualatex,xelatex,tlmgr}
#   uv python uninstall 3.12     # optional: uv's shared CPython download
#
# What gets put on PATH:
#   .toolchain/bun/bin              Bun (job-portal search CLIs)
#   .toolchain/.TinyTeX/bin/<arch>  lualatex / xelatex / tlmgr
#   .venv/bin                       Python 3.12 + pyyaml, openpyxl

if [ ! -f "$PWD/CLAUDE.md" ] || [ ! -d "$PWD/.claude" ]; then
  echo "env.sh: source this from the ai-job-search repo root." >&2
  return 1 2>/dev/null || exit 1
fi

AJS_ROOT="$PWD"
export AJS_ROOT

# --- Bun -------------------------------------------------------------------
export BUN_INSTALL="$AJS_ROOT/.toolchain/bun"
case ":$PATH:" in
  *":$BUN_INSTALL/bin:"*) ;;
  *) PATH="$BUN_INSTALL/bin:$PATH" ;;
esac

# --- TinyTeX ---------------------------------------------------------------
for _ajs_texbin in "$AJS_ROOT"/.toolchain/.TinyTeX/bin/*/; do
  [ -x "$_ajs_texbin/lualatex" ] || continue
  _ajs_texbin="${_ajs_texbin%/}"
  case ":$PATH:" in
    *":$_ajs_texbin:"*) ;;
    *) PATH="$_ajs_texbin:$PATH" ;;
  esac
done
unset _ajs_texbin

export PATH

# --- Python ----------------------------------------------------------------
if [ -f "$AJS_ROOT/.venv/bin/activate" ]; then
  . "$AJS_ROOT/.venv/bin/activate"
fi

# --- Report ----------------------------------------------------------------
ajs_doctor() {
  printf '%-12s %s\n' "repo" "$AJS_ROOT"
  for _c in python bun lualatex xelatex pdftotext; do
    if command -v "$_c" >/dev/null 2>&1; then
      printf '%-12s %-11s %s\n' "$_c" "$(command -v "$_c" | sed "s|$AJS_ROOT|.|")" \
        "$(case "$_c" in
             python)    python --version 2>&1 | awk '{print $2}' ;;
             bun)       bun --version ;;
             lualatex)  lualatex --version 2>&1 | head -1 | sed 's/.*Version //;s/ .*//' ;;
             xelatex)   xelatex --version 2>&1 | head -1 | awk '{print $2}' ;;
             pdftotext) pdftotext -v 2>&1 | head -1 | awk '{print $3}' ;;
           esac)"
    else
      printf '%-12s %s\n' "$_c" "MISSING"
    fi
  done
  unset _c
}

ajs_doctor
