---
'edgefit': patch
---

A member that the Node data does not list, below an API that the target lacks or has with another type, now gets the finding of that API, unless the Web API data lists the member or an API above it. For example, `navigator.locks.zzzq()` on workerd is now `unsupported`, because `navigator.locks` does not exist there. Before, edgefit gave no finding for it. The detail line says `is below an API that does not exist on the target`. A member below a leaf of the Node data, or below its depth limit, already got the result of the API above it. Its detail line now also starts with `is below an API that`. Below an API that the target has, the Node data still gives no finding for such a member.
