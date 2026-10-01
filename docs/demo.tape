# Regenerate the demo from the repository root: vp pack && vhs docs/demo.tape
# docs/demo-setup.sh creates a temporary Hono Worker that uses sharp, with a fix on a second branch.
Output docs/public/demo.gif

Set Shell bash
Set FontFamily "JetBrains Mono, Menlo, monospace"
Set FontSize 14
Set LineHeight 1.25
Set Width 1600
Set Height 900
Set Padding 28
Set Margin 24
Set MarginFill "#1e1e2e"
Set WindowBar Colorful
Set BorderRadius 10
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set CursorBlink false
Set WaitTimeout 90s
Set WaitPattern /❯$/

Hide
Type "source docs/demo-setup.sh"
Enter
Wait
Show

# 1. check: every finding names the package, the file and the import chain.
Sleep 600ms
Type "npx edgefit check"
Sleep 300ms
Enter
Wait
Sleep 7s

# 2. compare: the same APIs on every runtime, side by side.
Hide
Type "clear"
Enter
Wait
Show
Type "npx edgefit compare workerd bun deno"
Sleep 300ms
Enter
Wait
Sleep 4s

# 3. diff: compare the reports of two branches, as a CI job does.
Hide
Type "clear"
Enter
Wait
Show
Type "npx edgefit check --format json > main.json"
Sleep 300ms
Enter
Wait
Type "git switch -q use-images-binding"
Sleep 300ms
Enter
Wait
Type "npx edgefit check --format json > branch.json"
Sleep 300ms
Enter
Wait
Type "npx edgefit diff main.json branch.json"
Sleep 300ms
Enter
Wait
Sleep 6s

# 4. package: check a dependency from the registry before you add it.
Hide
Type "clear"
Enter
Wait
Show
Type "npx edgefit package nanoid"
Sleep 300ms
Enter
Wait
Sleep 6s
