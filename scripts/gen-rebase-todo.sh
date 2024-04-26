#! /bin/bash
set -ueo pipefail
declare -r USAGE="Usage: $0 <commit>

Capture merge-inclusive history of the current branch since <commit>
and output it as a todo list that will recreate it on another branch
when used to overwrite the \"noop\" contents of \`git rebase -i HEAD\`.

This is useful for cherry-picking onto a release branch.
"
usage() {
  [ -n "$1" ] && printf '%s\n' "$1"
  printf '%s' "$USAGE"
  exit 64
}
case "${1-}" in
  --help) usage ;;
  -*) usage 1>&2 "Error: unknown option \"$1\"" ;;
  '') usage 1>&2 "Error: missing commit" ;;
esac

since="$1"

# Get an an initial todo list from `git rebase -i` by using a fake
# editor that echoes the file to standard output and then trucates it to
# ensure that no rebase actually happens.
# Then send that todo list through a transformation pipeline.
fake_editor='cat </dev/null "$@"; truncate -s0 "$@"'
GIT_SEQUENCE_EDITOR="sh -c '$fake_editor' -" \
  git rebase -i --rebase-merges "$since" 2> /dev/null \
  | {
    # Remove any final block of instruction comments (by appending
    # blanks/comments to hold space and flushing that before other lines,
    # minus the line feed before the first appended content).
    sed -nE '/^$|^#/ { H; d; }; H; s/.*//; x; s/^[[:cntrl:]]//; p;'
  } \
  | {
    # TODO: When `gh` CLI is available, use it to look up the PR for each
    # `# Branch $branchName` lines and insert a reference like
    cat
  } \
  | {
    awk '
    # Restructure branch-specific blocks:
    # * Move an isolated initial `label` into the first block (and
    #   remove a following no-op `reset`).
    # * When a block starts with `reset` + `merge -C`, move them into
    #   the previous block.

    NR == 1 && match($0, /^label /) {
      firstBlockPrefix = $0 "\n";
      label = substr($0, RLENGTH + 1, length($0) - RLENGTH);
      noopReset = "reset " label;
      next;
    }
    firstBlockPrefix != "" && $0 == noopReset {
      next;
    }
    /^$|^# .*[Bb]ranch .*/ {
      blockHeader = blockHeader $0 "\n";
      next;
    }
    blockHeader != "" {
      if (cmdBuf == "" && match($0, /^reset /)) {
        cmdBuf = $0 "\n";
        next;
      } else if (cmdBuf != "" && match($0, /^merge -C/)) {
        printf "%s%s", cmdBuf, $0 "\n";
        cmdBuf = "";
        next;
      }
    }
    {
      printf "%s%s%s%s", blockHeader, firstBlockPrefix, cmdBuf, $0 "\n"
      blockHeader = "";
      firstBlockPrefix = "";
      cmdBuf = "";
    }
    END {
      printf "%s%s%s", blockHeader, firstBlockPrefix, cmdBuf;
    }
  '
  } \
  | {
    # Rename each label that receives `merge -C` in a block to
    # "base-$branchName".
    awk '
    function addLabel(label) {
      if (++labels[label] == 1) return;
      print "duplicate label: " label > "/dev/stderr";
      exit 1;
    }
    match($0, /^$|^# .*[Bb]ranch /) {
      branch = substr($0, RLENGTH + 1, length($0) - RLENGTH);
    }
    branch != "" && match($0, /^merge -C /) && match(prev, /^reset /) {
      onto = substr(prev, RLENGTH + 1, length($0) - RLENGTH);
      sub(/[[:space:]].*/, "", onto);
      newOnto = "base-" branch;
      addLabel(newOnto);
      renames[++renameCount] = onto SUBSEP newOnto;
    }
    /^label / {
      addLabel(substr($0, RLENGTH + 1, length($0) - RLENGTH));
    }
    {
      buf = buf $0 "\n";
      prev = $0;
    }
    END {
      # For "last-wins" semantics, apply renames in reverse order.
      for (i = renameCount; split(renames[i], pair, SUBSEP); i--) {
        j = split("label reset", rebaseCmds, " ");
        for (; cmd = rebaseCmds[j]; j--) {
          newBuf = "";
          seekLine = sprintf("\n%s %s", cmd, pair[1]);
          while (k = index(buf, seekLine)) {
            len = length(seekLine);
            r = sprintf("\n%s %s", cmd, pair[2]);
            if (!match(substr(buf, k + len, 1), /[ \n]/)) r = seekLine;
            newBuf = newBuf substr(buf, 1, k - 1) r;
            buf = substr(buf, k + len, length(buf) - (k - 1) - len);
          }
          buf = newBuf buf;
        }
      }
      printf "%s", buf;
    }
  '
  }
