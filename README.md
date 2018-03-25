# github-status-check-editor

This is a [web interface](https://not-an-aardvark.github.io/github-status-check-editor) for editing status checks on GitHub through GitHub's API. It can be used to edit the text/URL/state of an existing status, or to create a new status on a PR.

This can be useful if your PR has a status check which isn't supposed to be there (e.g. due to a bug or an outage in an integration). If you know that a given status check *should* be passing but hasn't been updated properly, you can use this tool to modify it so that it doesn't interfere with your workflow.

## Development

```bash
$ git clone https://github.com/not-an-aardvark/github-status-check-editor
$ cd github-status-check-editor/
$ npm install
$ npm run build
$ open index.html # or `start index.html` on Windows
```
