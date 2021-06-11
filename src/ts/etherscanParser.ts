import axios from 'axios'
import { ASTNode } from '@solidity-parser/parser/dist/ast-types'
import { parse } from '@solidity-parser/parser'
import { VError } from 'verror'

import { convertNodeToUmlClass } from './parser'
import { UmlClass } from './umlClass'

const networks = <const>['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
type Network = typeof networks[number]

export class EtherscanParser {
    readonly url: string

    constructor(
        protected apikey: string = 'ZAD4UI2RCXCQTP38EXS3UY2MPHFU5H9KB1',
        public network: Network = 'mainnet'
    ) {
        if (!networks.includes(network)) {
            throw new Error(
                `Invalid network "${network}". Must be one of ${networks}`
            )
        } else if (network === 'mainnet') {
            this.url = 'https://api.etherscan.io/api'
        } else {
            this.url = `https://api-${network}.etherscan.io/api`
        }
    }

    /**
     * Parses the verified source code files from Etherscan
     * @param contractAddress Ethereum contract address with a 0x prefix
     * @return Promise with an array of UmlClass objects
     */
    async getUmlClasses(contractAddress: string): Promise<UmlClass[]> {
        const sourceFiles = await this.getSourceCode(contractAddress)

        let umlClasses: UmlClass[] = []

        for (const sourceFile of sourceFiles) {
            const node = await this.parseSourceCode(sourceFile.code)
            const umlClass = convertNodeToUmlClass(node, sourceFile.filename)
            umlClasses = umlClasses.concat(umlClass)
        }

        return umlClasses
    }

    /**
     * Parses Solidity source code into an ASTNode object
     * @param sourceCode Solidity source code
     * @return Promise with an ASTNode object from @solidity-parser/parser
     */
    async parseSourceCode(sourceCode: string): Promise<ASTNode> {
        try {
            const node = parse(sourceCode, {})

            return node
        } catch (err) {
            throw new VError(
                err,
                `Failed to parse solidity code from source code:\n${sourceCode}`
            )
        }
    }

    /**
     * Calls Etherscan to get the verified source code for the specified contract address
     * @param contractAddress Ethereum contract address with a 0x prefix
     */
    async getSourceCode(
        contractAddress: string
    ): Promise<{ code: string; filename: string }[]> {
        const description = `get verified source code for address ${contractAddress} from Etherscan API.`

        try {
            const response: any = await axios.get(this.url, {
                params: {
                    module: 'contract',
                    action: 'getsourcecode',
                    address: contractAddress,
                    apikey: this.apikey,
                },
            })

            if (!Array.isArray(response?.data?.result)) {
                throw new Error(
                    `Failed to ${description}. No result array in HTTP data: ${JSON.stringify(
                        response?.data
                    )}`
                )
            }

            const results = response.data.result.map((result: any) => {
                if (!result.SourceCode) {
                    throw new Error(
                        `Failed to ${description}. Most likely the contract has not been verified on Etherscan.`
                    )
                }
                // if multiple Solidity source files
                // I think this is an Etherscan bug where the SourceCode field is encodes in two curly brackets. eg {{}}
                if (result.SourceCode[0] === '{') {
                    // remove first { and last } from the SourceCode string so it can be JSON parsed
                    const parableResultString = result.SourceCode.slice(1, -1)
                    try {
                        const sourceCodeObject = JSON.parse(parableResultString)
                        const sourceFiles = Object.entries(
                            sourceCodeObject.sources
                        )
                        return sourceFiles.map(
                            ([filename, code]: [
                                string,
                                { content: string }
                            ]) => ({
                                code: code.content,
                                filename,
                            })
                        )
                    } catch (err) {
                        throw new VError(
                            `Failed to parse Solidity source code from Etherscan's SourceCode. ${result.SourceCode}`
                        )
                    }
                }
                // if multiple Solidity source files with no Etherscan bug in the SourceCode field
                if (result?.SourceCode?.sources) {
                    const sourceFiles = Object.values(result.SourceCode.sources)
                    return sourceFiles.map(
                        ([filename, code]: [string, { content: string }]) => ({
                            code: code.content,
                            filename,
                        })
                    )
                }
                // Solidity source code was not uploaded into multiple files so is just in the SourceCode field
                return {
                    code: result.SourceCode,
                    filename: contractAddress,
                }
            })
            return results.flat(1)
        } catch (err) {
            if (!err.response) {
                throw new Error(`Failed to ${description}. No HTTP response.`)
            }
            throw new VError(
                `Failed to ${description}. HTTP status code ${err.response?.status}, status text: ${err.response?.statusText}`
            )
        }
    }
}
