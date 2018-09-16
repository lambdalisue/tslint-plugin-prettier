import * as utils from 'eslint-plugin-prettier';
import * as path from 'path';
import * as prettier from 'prettier';
import * as tslint from 'tslint';
import * as ts from 'typescript';

export class Rule extends tslint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): tslint.RuleFailure[] {
    return this.applyWithWalker(
      new Walker(sourceFile, this.ruleName, this.ruleArguments),
    );
  }
}

class Walker extends tslint.AbstractWalker<any[]> {
  public walk(sourceFile: ts.SourceFile) {
    const [ruleArgument1] = this.options;

    let options: prettier.Options = {};

    switch (typeof ruleArgument1) {
      case 'object':
        options = ruleArgument1 as prettier.Options;
        break;
      case 'string': {
        const filePath = path.resolve(process.cwd(), ruleArgument1 as string);
        const resolvedConfig = prettier.resolveConfig.sync(filePath);

        // istanbul ignore next
        if (resolvedConfig === null) {
          throw new Error(`Config file not found: ${filePath}`);
        }

        options = resolvedConfig;
        break;
      }
      default: {
        const resolvedConfig = prettier.resolveConfig.sync(sourceFile.fileName);

        if (resolvedConfig !== null) {
          options = resolvedConfig;
        }

        break;
      }
    }

    const source = sourceFile.getFullText();
    const formatted = prettier.format(source, {
      parser: 'typescript',
      ...options,
    });

    if (source === formatted) {
      return;
    }

    reportDifferences(this, source, formatted);
  }
}

function reportDifferences(
  walkContext: tslint.WalkContext<any>,
  source: string,
  formatted: string,
) {
  utils.generateDifferences(source, formatted).forEach(difference => {
    const {
      operation,
      offset: start,
      deleteText = '',
      insertText = '',
    } = difference;

    const end = start + deleteText.length;
    const deleteCode = utils.showInvisibles(deleteText);
    const insertCode = utils.showInvisibles(insertText);

    switch (operation) {
      case 'insert':
        walkContext.addFailureAt(
          start,
          1,
          `Insert \`${insertCode}\``,
          tslint.Replacement.appendText(start, insertText),
        );
        break;
      case 'delete':
        walkContext.addFailure(
          start,
          end,
          `Delete \`${deleteCode}\``,
          tslint.Replacement.deleteFromTo(start, end),
        );
        break;
      case 'replace':
        walkContext.addFailure(
          start,
          end,
          `Replace \`${deleteCode}\` with \`${insertCode}\``,
          tslint.Replacement.replaceFromTo(start, end, insertText),
        );
        break;
      // istanbul ignore next
      default:
        throw new Error(`Unexpected operation '${operation}'`);
    }
  });
}
