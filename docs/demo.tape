# Regenerate the demo: vp pack && vhs docs/demo.tape
# It runs the local build against apps/known-bad (install first: vp install in apps/).
Output docs/public/demo.gif

Set Shell bash
Set FontSize 14
Set Width 1100
Set Height 690
Set Padding 20
Set TypingSpeed 55ms
Set Theme "Catppuccin Mocha"

Hide
Type "cd apps/known-bad && export NO_COLOR= && npx() { node ../../dist/cli/main.mjs $(echo ${@:2}); } && clear"
Enter
Show

Sleep 800ms
Type "npx edgefit check"
Sleep 400ms
Enter
Sleep 7s
