// 一次性清理脚本（已用完,留个空文件标记已清理过）
// 想再清理测试数据,直接 node --experimental-sqlite --no-warnings -e "
//   const { DatabaseSync } = require('node:sqlite');
//   const db = new DatabaseSync(require('node:path').join(__dirname,'data','habit.db'));
//   db.exec('PRAGMA foreign_keys = ON');
//   console.log(db.prepare(\"DELETE FROM users WHERE nickname IN ('alice2','bob2')\").run().changes);
//   db.close();
// "