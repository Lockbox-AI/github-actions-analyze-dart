const core = require('@actions/core');
const exec = require('@actions/exec');
const path = require('path');

async function run() {
  try {
    const workingDirectory = path.resolve(process.env.GITHUB_WORKSPACE, core.getInput('working-directory'))

    const [analyzeErrorCount, analyzeWarningCount, analyzeInfoCount] = await analyze(workingDirectory);
    const formatWarningCount = await format(workingDirectory);

    const issueCount = analyzeErrorCount + analyzeWarningCount + analyzeInfoCount + formatWarningCount;
    const failOnInfos = core.getInput('fail-on-infos') === 'true';
    const failOnWarnings = core.getInput('fail-on-warnings') === 'true';
    const message = `${issueCount} issue${issueCount === 1 ? '' : 's'} found.`;

    if (analyzeErrorCount > 0 || ((failOnInfos || failOnWarnings) && issueCount > 0)) {
      core.setFailed(message);
    } else {
      console.log(message);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function analyze(workingDirectory) {
  let output = '';

  const options = { cwd: workingDirectory, ignoreReturnCode: true };
  options.listeners = {
    stdout: (data) => {
      output += data.toString();
    },
    stderr: (data) => {
      output += data.toString();
    }
  };

  const args = ['--format', 'machine'];
  args.push('.');

  await exec.exec('dart analyze', args, options);

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const lines = output.trim().split(/\r?\n/);
  const dataDelimiter = '|';

  for (const line of lines) {
    if (!line.includes(dataDelimiter)) {
      continue;
    }

    // Example line:
    // "WARNING|STATIC_WARNING|DEAD_NULL_AWARE_EXPRESSION|/home/runner/work/lockbox-frontend/lockbox-frontend/code/lib/src/screens/analytics/dashboard_analysis_detail_tabs/dashboard_analysis_detail_screen.dart|204|150|2|The left operand can't be null, so the right operand is never executed."

    const lineData = line.split(dataDelimiter);
    const lint = lineData[2];
    const lintLowerCase = lint.toLowerCase();
    const file = lineData[3].replace(workingDirectory, '');
    const annotationLine = lineData[4];
    const annotationColumn = lineData[5];
    const lintMessage = lineData[7];
    const url = lint === lintLowerCase
      ? `https://dart-lang.github.io/linter/lints/${lint}.html`
      : `https://dart.dev/tools/diagnostic-messages#${lintLowerCase}`
    
    const message = `${lintMessage} For more details, see ${url}`;
    const annotation = {
      title: "Code Analysis Finding",
      file: file,
      startLine: parseInt(annotationLine),
      endLine: parseInt(annotationLine),
      startColumn: parseInt(annotationColumn),
      endColumn: parseInt(annotationColumn)
    };

    if (lineData[0] === 'ERROR') {
      core.error(message, annotation);
      errorCount++;
    } else if (lineData[0] === 'WARNING') {
      core.warning(message, annotation);
      warningCount++;
    } else {
      core.notice(message, annotation);
      infoCount++;
    }
  }

  return [errorCount, warningCount, infoCount];
}

async function format(workingDirectory) {
  let output = '';

  const options = { cwd: workingDirectory, ignoreReturnCode: true };
  options.listeners = {
    stdout: (data) => {
      output += data.toString();
    },
    stderr: (data) => {
      output += data.toString();
    }
  };

  const args = ['format', '--output=none'];
  const lineLength = core.getInput('line-length');

  if (lineLength) {
    args.push('--line-length');
    args.push(lineLength);
  }

  args.push('.');

  await exec.exec('dart', args, options);
  
  let warningCount = 0;
  const lines = output.trim().split(/\r?\n/);

  for (const line of lines) {
    if (!line.endsWith('.dart')) continue;
    const file = line.substring(8); // Remove the "Changed " prefix

    const message = `Invalid format. For more details, see https://dart.dev/guides/language/effective-dart/style#formatting`;
    const annotation = {
      title: "Code Analysis Style Finding",
      file: file
    };

    core.debug(`File '${file}' has invalid format.`);
    core.warning(message, annotation);
    warningCount++;
  }

  return warningCount;
}

run();
