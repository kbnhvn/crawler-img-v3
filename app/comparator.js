const fs  = require('fs');

let rawList = fs.readFileSync('listFromBackup.txt').toString().split("\n");
let uniqueList = [...new Set(rawList)];
fs.writeFile("listFomBackupSorted.txt", uniqueList.join ('\n'), "utf-8", (err) => {
    if (err) console.log(err);
    else console.log("Data saved");
});
