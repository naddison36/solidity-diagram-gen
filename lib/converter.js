"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePng = exports.writeSVG = exports.writeDot = exports.convertDot2Svg = exports.addAssociationsToDot = exports.convertUmlClasses2Dot = exports.convertUmlClassesToSvg = exports.generateFilesFromUmlClasses = void 0;
const fs_1 = require("fs");
const path = require('path');
const svg_to_png = require('svg-to-png');
const verror_1 = require("verror");
const Viz = require('viz.js');
const dotGenerator_1 = require("./dotGenerator");
const umlClass_1 = require("./umlClass");
const debug = require('debug')('sol2uml');
const generateFilesFromUmlClasses = async (umlClasses, outputBaseName, outputFormat = 'svg', outputFilename, clusterFolders = false, classOptions = {}) => {
    const dot = convertUmlClasses2Dot(umlClasses, clusterFolders, classOptions);
    if (outputFormat === 'dot' || outputFormat === 'all') {
        writeDot(dot, outputFilename);
        // No need to continue if only generating a dot file
        if (outputFormat === 'dot') {
            return;
        }
    }
    if (!outputFilename) {
        // If all output then extension is svg
        const outputExt = outputFormat === 'all' ? 'svg' : outputFormat;
        // if outputBaseName is a folder
        try {
            const folderOrFile = fs_1.lstatSync(outputBaseName);
            if (folderOrFile.isDirectory()) {
                const parsedDir = path.parse(process.cwd());
                outputBaseName = path.join(process.cwd(), parsedDir.name);
            }
        }
        catch (err) { } // we can ignore errors as it just means outputBaseName is not a folder
        outputFilename = outputBaseName + '.' + outputExt;
    }
    const svg = convertDot2Svg(dot);
    // write svg file even if only wanting png file as we generateFilesFromUmlClasses svg files to png
    await writeSVG(svg, outputFilename, outputFormat);
    if (outputFormat === 'png' || outputFormat === 'all') {
        await writePng(svg, outputFilename);
    }
};
exports.generateFilesFromUmlClasses = generateFilesFromUmlClasses;
const convertUmlClassesToSvg = async (umlClasses, clusterFolders = false) => {
    const dot = convertUmlClasses2Dot(umlClasses, clusterFolders);
    return convertDot2Svg(dot);
};
exports.convertUmlClassesToSvg = convertUmlClassesToSvg;
function convertUmlClasses2Dot(umlClasses, clusterFolders = false, classOptions = {}) {
    let dotString = `
digraph UmlClassDiagram {
rankdir=BT
color=black
arrowhead=open
node [shape=record, style=filled, fillcolor=gray95]`;
    // Sort UML Classes by folder of source file
    const umlClassesSortedByCodePath = sortUmlClassesByCodePath(umlClasses);
    let currentCodeFolder = '';
    for (const umlClass of umlClassesSortedByCodePath) {
        const codeFolder = path.dirname(umlClass.relativePath);
        if (currentCodeFolder !== codeFolder) {
            // Need to close off the last subgraph if not the first
            if (currentCodeFolder != '') {
                dotString += '\n}';
            }
            dotString += `
subgraph ${getSubGraphName(clusterFolders)} {
label="${codeFolder}"`;
            currentCodeFolder = codeFolder;
        }
        dotString += dotGenerator_1.dotUmlClass(umlClass, classOptions);
    }
    // Need to close off the last subgraph if not the first
    if (currentCodeFolder != '') {
        dotString += '\n}';
    }
    dotString += addAssociationsToDot(umlClasses, classOptions);
    // Need to close off the last the digraph
    dotString += '\n}';
    debug(dotString);
    return dotString;
}
exports.convertUmlClasses2Dot = convertUmlClasses2Dot;
let subGraphCount = 0;
function getSubGraphName(clusterFolders = false) {
    if (clusterFolders) {
        return ` cluster_${subGraphCount++}`;
    }
    return ` graph_${subGraphCount++}`;
}
function sortUmlClassesByCodePath(umlClasses) {
    return umlClasses.sort((a, b) => {
        if (a.relativePath < b.relativePath) {
            return -1;
        }
        if (a.relativePath > b.relativePath) {
            return 1;
        }
        return 0;
    });
}
function addAssociationsToDot(umlClasses, classOptions = {}) {
    let dotString = '';
    // for each class
    for (const sourceUmlClass of umlClasses) {
        // for each association in that class
        for (const association of Object.values(sourceUmlClass.associations)) {
            // find the target class with the same class name and
            // codePath of the target in the importedPaths of the source class OR
            // the codePath of the target is the same as the codePath pf the source class
            const targetUmlClass = umlClasses.find((targetUmlClass) => {
                return (targetUmlClass.name === association.targetUmlClassName &&
                    (sourceUmlClass.importedPaths.includes(targetUmlClass.absolutePath) ||
                        sourceUmlClass.absolutePath ===
                            targetUmlClass.absolutePath));
            });
            if (targetUmlClass) {
                dotString += addAssociationToDot(sourceUmlClass, targetUmlClass, association, classOptions);
            }
        }
    }
    return dotString;
}
exports.addAssociationsToDot = addAssociationsToDot;
function addAssociationToDot(sourceUmlClass, targetUmlClass, association, classOptions = {}) {
    // do not include library or interface associations if hidden
    if ((classOptions.hideLibraries &&
        targetUmlClass.stereotype === umlClass_1.ClassStereotype.Library) ||
        (classOptions.hideInterfaces &&
            targetUmlClass.stereotype === umlClass_1.ClassStereotype.Interface)) {
        return '';
    }
    let dotString = `\n${sourceUmlClass.id} -> ${targetUmlClass.id} [`;
    if (association.referenceType == umlClass_1.ReferenceType.Memory ||
        (association.realization &&
            targetUmlClass.stereotype === umlClass_1.ClassStereotype.Interface)) {
        dotString += 'style=dashed, ';
    }
    if (association.realization) {
        dotString += 'arrowhead=empty, arrowsize=3, ';
        if (!targetUmlClass.stereotype) {
            dotString += 'weight=4, ';
        }
        else {
            dotString += 'weight=3, ';
        }
    }
    return dotString + ']';
}
function convertDot2Svg(dot) {
    debug(`About to convert dot to SVG`);
    try {
        return Viz(dot);
    }
    catch (err) {
        console.error(`Failed to convert dot to SVG. ${err.message}`);
        console.log(dot);
        throw new verror_1.VError(err, `Failed to parse dot string`);
    }
}
exports.convertDot2Svg = convertDot2Svg;
function writeDot(dot, dotFilename = 'classDiagram.dot') {
    debug(`About to write Dot file to ${dotFilename}`);
    fs_1.writeFile(dotFilename, dot, (err) => {
        if (err) {
            throw new verror_1.VError(err, `Failed to write Dot file to ${dotFilename}`);
        }
        else {
            console.log(`Dot file written to ${dotFilename}`);
        }
    });
}
exports.writeDot = writeDot;
function writeSVG(svg, svgFilename = 'classDiagram.svg', outputFormats = 'png') {
    debug(`About to write SVN file to ${svgFilename}`);
    if (outputFormats === 'png') {
        const parsedFile = path.parse(svgFilename);
        if (!parsedFile.dir) {
            svgFilename = process.cwd() + '/' + parsedFile.name + '.svg';
        }
        else {
            svgFilename = parsedFile.dir + '/' + parsedFile.name + '.svg';
        }
    }
    return new Promise((resolve, reject) => {
        fs_1.writeFile(svgFilename, svg, (err) => {
            if (err) {
                reject(new verror_1.VError(err, `Failed to write SVG file to ${svgFilename}`));
            }
            else {
                console.log(`Generated svg file ${svgFilename}`);
                resolve();
            }
        });
    });
}
exports.writeSVG = writeSVG;
async function writePng(svg, filename) {
    // get svg file name from png file name
    const parsedPngFile = path.parse(filename);
    const pngDir = parsedPngFile.dir === '' ? '.' : path.resolve(parsedPngFile.dir);
    const svgFilename = pngDir + '/' + parsedPngFile.name + '.svg';
    const pngFilename = pngDir + '/' + parsedPngFile.name + '.png';
    debug(`About to convert svg file ${svgFilename} to png file ${pngFilename}`);
    try {
        await svg_to_png.convert(path.resolve(svgFilename), pngDir);
    }
    catch (err) {
        throw new verror_1.VError(err, `Failed to convert SVG file ${svgFilename} to PNG file ${pngFilename}`);
    }
    console.log(`Generated png file ${pngFilename}`);
}
exports.writePng = writePng;
//# sourceMappingURL=converter.js.map