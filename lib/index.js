'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const ERROR_MESSAGE = {
    expectedNoArguments: (extra = "") => `Forventet ingen argumenter. ${extra}`,
    expectedOneArgument: (extra = "") => `Forventet ett argument. ${extra}`,
    expectedTwoArguments: (extra = "") => `Forventet to argumenter. ${extra}`,
    unexpectedToken: (token) => `Skjønner ikke hva dette er: '${token}'`,
    invalidRegistry: (reg) => `Ugyldig register: '${reg}'`,
};
function classify(line) {
    if (line.length === 0)
        return "whitespace";
    if (line.match(/^;.*$/))
        return "comment";
    if (line.match(/^[0-9a-zA-ZæøåÆØÅ\-_]+:$/))
        return "label";
    if (line.match(/^.DATA [x0-9a-fA-F, ]*$/))
        return "data";
    return "instruction";
}
function preprosess(sourceCode) {
    let address = 0;
    return sourceCode.split("\n").reduce((prev, current, lineNumber) => {
        const line = current.trim();
        const { instructions, labels } = prev;
        switch (classify(line)) {
            case "label":
                labels[line.slice(0, -1)] = address;
                return { instructions, labels };
            case "data":
                instructions.push({ lineNumber, address, raw: line });
                address += tokenize(line).args.length;
                return { labels, instructions };
            case "instruction":
                instructions.push({ lineNumber, address, raw: line });
                address += 2;
                return { labels, instructions };
            default:
                return { labels, instructions };
        }
    }, {
        instructions: [],
        labels: {},
    });
}
function tokenize(raw) {
    const commentsRemoved = raw.trim().split(";")[0];
    const [opCode, ...rest] = commentsRemoved
        .split(" ")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    const args = (rest || [])
        .join("")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    return { opCode, args };
}
function translate(instruction, labels) {
    const { opCode, args } = instruction;
    if (instruction.opCode === ".DATA") {
        return new Uint8Array(args.map(getVal));
    }
    const ensureNoArgs = () => {
        if (args.length > 0)
            throw ERROR_MESSAGE.expectedNoArguments(`${instruction.opCode}: ${instruction.args}`);
    };
    const singleArg = () => {
        if (args.length !== 1)
            throw ERROR_MESSAGE.expectedOneArgument(`${instruction.opCode}: ${instruction.args}`);
        return args[0];
    };
    const twoArguments = () => {
        if (args.length !== 2)
            throw ERROR_MESSAGE.expectedTwoArguments(`${instruction.opCode}: ${instruction.args}`);
        return args;
    };
    const aluOps = [
        "OG",
        "ELLER",
        "XELLER",
        "VSKIFT",
        "HSKIFT",
        "PLUSS",
        "MINUS",
    ];
    const cmpOps = ["LIK", "ULIK", "ME", "MEL", "SE", "SEL"];
    switch (instruction.opCode) {
        case "STOPP":
            ensureNoArgs();
            return writeHalt();
        case "SETT":
            return writeSet(twoArguments());
        case "FINN":
            return writeLocate(singleArg(), labels);
        case "LAST":
            return writeLoad(singleArg());
        case "LAGR":
            return writeStore(singleArg());
        // ALU
        case "OG":
        case "ELLER":
        case "XELLER":
        case "VSKIFT":
        case "HSKIFT":
        case "PLUSS":
        case "MINUS":
            return writeAlu(aluOps.indexOf(opCode), twoArguments());
        // I/O
        case "LES":
            return writeRead(singleArg());
        case "SKRIV":
            return writeWrite(singleArg());
        // CMP
        case "LIK":
        case "ULIK":
        case "ME":
        case "MEL":
        case "SE":
        case "SEL":
            return writeCmp(cmpOps.indexOf(opCode), twoArguments());
        case "HOPP":
            return writeJmp(8, singleArg(), labels);
        case "BHOPP":
            return writeJmp(9, singleArg(), labels);
        case "TUR":
            return writeCall(singleArg(), labels);
        case "RETUR":
            ensureNoArgs();
            return writeRet();
        case "NOPE":
            ensureNoArgs();
            return writeNop();
        default:
            throw ERROR_MESSAGE.unexpectedToken(opCode);
    }
}
function assemble(sourceCode) {
    const sourceMap = preprosess(sourceCode);
    const instructions = sourceMap.instructions.map((instr) => {
        const instruction = tokenize(instr.raw);
        return translate(instruction, sourceMap.labels);
    });
    const magic = new Uint8Array([0x2e, 0x53, 0x4c, 0x45, 0x44, 0x45, 0x38]);
    const exe = concat(...[magic, ...instructions]);
    const pdb = sourceMap.instructions.reduce((prev, instr) => (Object.assign(Object.assign({}, prev), { [instr.address]: instr })), {});
    return { exe, pdb };
}
function concat(...buffers) {
    const totalLength = buffers.reduce((acc, value) => acc + value.length, 0);
    if (!buffers.length)
        return new Uint8Array([]);
    const result = new Uint8Array(totalLength);
    let length = 0;
    for (const array of buffers) {
        result.set(array, length);
        length += array.length;
    }
    return result;
}
function u16(value) {
    return new Uint8Array([value & 0xff, (value & 0xff00) >> 8]);
}
function nibs(nib1, nib2, nib3, nib4) {
    return u16(nib1 | (nib2 << 4) | (nib3 << 8) | (nib4 << 12));
}
function nibsByte(nib1, nib2, byte) {
    return u16(nib1 | (nib2 << 4) | (byte << 8));
}
function nibVal(nib, val) {
    return u16(nib | (val << 4));
}
function isVal(valStr) {
    if (isNaN(+valStr))
        return false;
    return valStr.slice(2) === "0x"
        ? +valStr === parseInt(valStr, 16)
        : +valStr === parseInt(valStr);
}
function getVal(valStr) {
    return +valStr;
}
function getReg(regStr) {
    if (regStr[0] !== "r")
        throw ERROR_MESSAGE.invalidRegistry(regStr);
    const regNum = parseInt(regStr.slice(1));
    if (regNum < 0 || regNum > 15)
        throw ERROR_MESSAGE.invalidRegistry(regStr);
    return regNum;
}
function getAddr(addrStr, labels) {
    if (isVal(addrStr)) {
        return getVal(addrStr);
    }
    if (labels[addrStr] === undefined) {
        throw ERROR_MESSAGE.unexpectedToken(addrStr);
    }
    return labels[addrStr];
}
function writeHalt() {
    return u16(0);
}
function writeSet(args) {
    const [reg1, regOrValue] = args;
    const reg1Num = getReg(reg1);
    if (isVal(regOrValue)) {
        const value = getVal(regOrValue);
        return nibsByte(1, reg1Num, value);
    }
    else {
        const reg2Num = getReg(regOrValue);
        return nibsByte(2, reg1Num, reg2Num);
    }
}
function writeLocate(arg, labels) {
    const addr = getAddr(arg, labels);
    return nibVal(3, addr);
}
function writeLoad(reg) {
    const regNum = getReg(reg);
    return nibs(4, 0, regNum, 0);
}
function writeStore(reg) {
    const regNum = getReg(reg);
    return nibs(4, 1, regNum, 0);
}
function writeAlu(aluOp, args) {
    const [reg1, reg2] = args;
    const reg1Num = getReg(reg1);
    const reg2Num = getReg(reg2);
    return nibs(5, aluOp, reg1Num, reg2Num);
}
function writeRead(arg) {
    const reg = arg.trim();
    const regNum = getReg(reg);
    return nibs(6, 0, regNum, 0);
}
function writeWrite(arg) {
    const reg = arg.trim();
    const regNum = getReg(reg);
    return nibs(6, 1, regNum, 0);
}
function writeCmp(cmpOp, args) {
    const [reg1, reg2] = args;
    const reg1Num = getReg(reg1);
    const reg2Num = getReg(reg2);
    return nibs(7, cmpOp, reg1Num, reg2Num);
}
function writeJmp(jmpOp, arg, labels) {
    return nibVal(jmpOp, getAddr(arg, labels));
}
function writeCall(arg, labels) {
    return nibVal(0xa, getAddr(arg, labels));
}
function writeRet() {
    return u16(0xb);
}
function writeNop() {
    return u16(0xc);
}

const RECURSION_LIMIT = 1000;
const ERROR_MESSAGE$1 = {
    segmentationFault: "Segmenteringsfeil",
    recursionLimitExceeded: "Alt for mange funksjonskall inni hverandre",
    fileSizeTooBig: "Programmet får ikke plass i minnet",
    readAfterEndOfInput: "Programmet gikk tom for føde",
    unsupportedExecutable: "Dette skjønner jeg ingenting av",
    resourcesExhausted: (maxTicks) => `Programmet ble brutalt drept etter å ha benyttet hele ${maxTicks} sykluser`,
};
function readInstruction(memorySlice) {
    const instruction = new DataView(memorySlice.buffer).getUint16(0, true);
    return {
        operationClass: instruction & 0xf,
        operation: (instruction >> 4) & 0xf,
        address: instruction >> 4,
        value: instruction >> 8,
        argument1: (instruction >> 8) & 0xf,
        argument2: (instruction >> 12) & 0xf,
    };
}
function load(executable) {
    if (executable.byteLength > 4096) {
        throw ERROR_MESSAGE$1.fileSizeTooBig;
    }
    const magic = new TextDecoder("utf-8").decode(executable.slice(0, 7));
    if (magic !== ".SLEDE8")
        throw ERROR_MESSAGE$1.unsupportedExecutable;
    const memory = new Uint8Array(4096);
    let seek = 7;
    let i = 0;
    while (seek < executable.byteLength) {
        memory[i++] = executable[seek++];
    }
    return memory;
}
function* step(executable, stdin, maxTicks = 1000) {
    var _a;
    let inputPtr = 0;
    let tick = 0;
    let pc = 0;
    let flag = false;
    const regs = new Uint8Array(16);
    const memory = load(executable);
    let stdout = new Uint8Array();
    const backtrace = [];
    while (pc < memory.byteLength) {
        if (++tick > maxTicks)
            throw ERROR_MESSAGE$1.resourcesExhausted(maxTicks);
        yield { pc, flag, regs, memory, stdout, inputPtr };
        const instr = readInstruction(memory.slice(pc, pc + 2));
        pc += 2;
        // HALT
        if (instr.operationClass === 0x0)
            break;
        // SET
        else if (instr.operationClass === 0x1) {
            regs[instr.operation] = instr.value;
        }
        else if (instr.operationClass === 0x2) {
            regs[instr.operation] = regs[instr.argument1];
        }
        // FINN
        else if (instr.operationClass === 0x3) {
            regs[1] = (instr.address & 0x0f00) >> 8;
            regs[0] = instr.address & 0xff;
        }
        // LOAD / STORE
        else if (instr.operationClass === 0x4) {
            const addr = ((regs[1] << 8) | regs[0]) & 0xfff;
            if (instr.operation === 0)
                regs[instr.argument1] = memory[addr];
            else if (instr.operation === 1)
                memory[addr] = regs[instr.argument1];
            else
                throw ERROR_MESSAGE$1.segmentationFault;
        }
        // ALU
        else if (instr.operationClass === 0x5) {
            const reg1 = regs[instr.argument1];
            const reg2 = regs[instr.argument2];
            if (instr.operation === 0x0)
                regs[instr.argument1] &= reg2;
            else if (instr.operation === 0x1)
                regs[instr.argument1] |= reg2;
            else if (instr.operation === 0x2)
                regs[instr.argument1] ^= reg2;
            else if (instr.operation === 0x3)
                regs[instr.argument1] = (reg1 << reg2) & 0xff;
            else if (instr.operation === 0x4)
                regs[instr.argument1] >>= reg2;
            else if (instr.operation === 0x5)
                regs[instr.argument1] = (reg1 + reg2) & 0xff;
            else if (instr.operation === 0x6)
                regs[instr.argument1] = (reg1 - reg2) & 0xff;
            else
                throw ERROR_MESSAGE$1.segmentationFault;
        }
        // I/O
        else if (instr.operationClass === 0x6) {
            // READ
            if (instr.operation === 0x0) {
                if (stdin.length > inputPtr) {
                    regs[instr.argument1] = stdin[inputPtr++];
                }
                else {
                    throw ERROR_MESSAGE$1.readAfterEndOfInput;
                }
            }
            // WRITE
            else if (instr.operation === 0x1) {
                stdout = new Uint8Array([...stdout, regs[instr.argument1]]);
            }
            else
                throw ERROR_MESSAGE$1.segmentationFault;
        }
        // CMP
        else if (instr.operationClass === 0x7) {
            const reg1 = regs[instr.argument1];
            const reg2 = regs[instr.argument2];
            if (instr.operation === 0x0)
                flag = reg1 === reg2;
            else if (instr.operation === 0x1)
                flag = reg1 !== reg2;
            else if (instr.operation === 0x2)
                flag = reg1 < reg2;
            else if (instr.operation === 0x3)
                flag = reg1 <= reg2;
            else if (instr.operation === 0x4)
                flag = reg1 > reg2;
            else if (instr.operation === 0x5)
                flag = reg1 >= reg2;
            else
                throw ERROR_MESSAGE$1.segmentationFault;
        }
        // JMP
        else if (instr.operationClass === 0x8)
            pc = instr.address;
        // COND JMP
        else if (instr.operationClass === 0x9) {
            if (flag) {
                pc = instr.address;
            }
        }
        // CALL
        else if (instr.operationClass === 0xa) {
            if (backtrace.length >= RECURSION_LIMIT)
                throw ERROR_MESSAGE$1.recursionLimitExceeded;
            backtrace.push(pc);
            pc = instr.address;
        }
        // RET
        else if (instr.operationClass === 0xb) {
            pc = (_a = backtrace.pop()) !== null && _a !== void 0 ? _a : NaN;
            if (isNaN(pc))
                throw ERROR_MESSAGE$1.segmentationFault;
        }
        else if (instr.operationClass === 0xc)
            continue;
        else
            throw ERROR_MESSAGE$1.segmentationFault;
    }
    return { pc, flag, regs, memory, stdout, inputPtr };
}

exports.assemble = assemble;
exports.step = step;
