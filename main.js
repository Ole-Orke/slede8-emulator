const slede8 = require("./lib/index.js")
const fs = require("fs")

//Constants
const føde = "Frimerke"

function loadFile() {
    const file = fs.readFileSync("program_source.s8", "utf-8")
    console.log(file)
    return file
}

function test() {
    console.log("Test")
    let file = loadFile()
    let program = slede8.assemble(file)
    console.log(program.exe)
    console.log(program.pdb)
}

test()
