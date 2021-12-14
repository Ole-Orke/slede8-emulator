const slede8 = require("./lib/index.js")
const fs = require("fs")

//Constants
const FØDE = "Frimerke"
const MAX_FILE_SIZE = 4096

function loadFile() {
    const file = fs.readFileSync("extract.s8", "utf-8")
    console.log(file)
    return file
}

function runBinary(binary, føde) {
    let machineState = slede8.step(binary, føde)
    let state = machineState.next()
    let done = state.done
    while (!done) {
        state = machineState.next()
        console.log(state)
        done = state.done
    }
    return state
}

function runSource(file) {
    let program = slede8.assemble(file)
    let state = runBinary(program.exe, "")
    return state
}

function printState(state) {
    console.log("Program finished")
    console.log("Final state: ", state)
}

function test() {
    console.log("Test")
    file = loadFile()
    fileBuffer = Buffer.from(file.substr(0, 600))
    state = runBinary(fileBuffer, FØDE)
    printState(state)
}

test()
