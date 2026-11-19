// 忘记管理员密码时用：在主机上双击「重置密码.bat」，选人、输新密码。
// 选中的人会同时被设为「管理员」并恢复启用。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
const HOME = process.env.WORKBENCH_HOME || path.join(os.homedir(), "爆款工作台数据");
const file = path.join(HOME, "data", "workbench.db");
if (!fs.existsSync(file)) {
  console.log("没找到数据库：" + file);
  process.exit(1);
}
const db = new DatabaseSync(file);
const users = db.prepare("select id, name, role, active from users order by role = 'admin' desc, created_at").all();
if (!users.length) {
  console.log("还没有任何账号，直接打开工作台网页就会让你创建管理员。");
  process.exit(0);
}
users.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}（${u.role === "admin" ? "管理员" : "员工"}${u.active ? "" : "，已停用"}）`));
const rl = readline.createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  process.stdout.write(q);
  return String((await lines.next()).value ?? "");
};
const n = Number(await ask("\n要重置哪一个？输入前面的数字："));
const u = users[n - 1];
if (!u) {
  console.log("没有这个编号");
  process.exit(1);
}
const pwd = (await ask(`给「${u.name}」设新密码（至少 4 位）：`)).trim();
rl.close();
if (pwd.length < 4) {
  console.log("密码太短，没改");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(pwd, salt, 32).toString("hex")}`;
db.prepare("update users set password_hash = ?, role = 'admin', active = 1 where id = ?").run(hash, u.id);
console.log(`\n✅ 改好了。「${u.name}」现在是管理员，用新密码登录就行（工作台不用重启）。`);
