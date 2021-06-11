import { getSolidityFilesFromFolderOrFile } from '../index'

describe('Parser', () => {
    describe('getSolidityFilesFromFolderOrFile', () => {
        test('get Solidity files from contracts folder', async () => {
            const files = await getSolidityFilesFromFolderOrFile(
                './src/contracts'
            )
            expect(files).toHaveLength(18)
        })

        test('get Solidity files from folder with no sol files', async () => {
            const files = await getSolidityFilesFromFolderOrFile('./src/ts')
            expect(files).toHaveLength(0)
        })

        test('get Solidity file', async () => {
            const files = await getSolidityFilesFromFolderOrFile(
                './src/contracts/Caller.sol'
            )
            expect(files).toHaveLength(1)
        })

        test('get Solidity files including Open Zeppelin', async () => {
            const files = await getSolidityFilesFromFolderOrFile('.')
            expect(files).toHaveLength(102)
        })

        describe('Failures', () => {
            test("Reading a file that doesn't exist", async () => {
                expect.assertions(1)

                try {
                    await getSolidityFilesFromFolderOrFile(
                        './FleDoesNotExist.sol'
                    )
                } catch (err) {
                    expect(err.message).toMatch(/No such file or folder/)
                }
            })

            test("Reading a file that doesn't have a sol extension", async () => {
                expect.assertions(1)

                try {
                    await getSolidityFilesFromFolderOrFile('./package.json')
                } catch (err) {
                    expect(err.message).toMatch(
                        /does not have a .sol extension/
                    )
                }
            })
        })
    })
})
