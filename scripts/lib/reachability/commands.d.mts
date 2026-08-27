export type SimpleCommand = { executable: string; operands: string[] }

export function splitCommandLine(commandLine: string): string[][]
export function readSimpleCommand(tokens: string[]): SimpleCommand | undefined
export function readCommandLine(commandLine: string): SimpleCommand[]
export function isExecutableCommand(candidate: string): boolean
export function packageScriptReference(command: SimpleCommand): string | undefined
