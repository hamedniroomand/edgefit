//#region node_modules/jose/dist/webapi/lib/lock.js
function joseLock(name) {
	return navigator.locks.request(name, () => {});
}
//#endregion
//#region node_modules/task-lock/index.js
function taskLock(name) {
	return navigator.locks.request(name, () => {});
}
//#endregion
//#region #nitro/virtual/tasks
const tasks = {};
//#endregion
//#region server/utils/lock.ts
const lock = () => joseLock("a") ?? taskLock("b") ?? tasks;
//#endregion
export { lock };
