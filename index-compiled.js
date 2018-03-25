var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function sendGraphqlRequest({ token, query }) {
  return fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${ token }`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query })
  }).then(response => {
    if (response.status >= 200 && response.status < 300) {
      return response.json();
    }
    throw new Error(`Request error (status ${ response.status })`);
  }).then(({ data: { repository: { pullRequest: { commits: { nodes: [{ commit }] } } } } }) => commit);
}

function createStatus({
  token, owner, repo, commitSha, context, description, targetUrl, state
}) {
  return fetch(`https://api.github.com/repos/${ owner }/${ repo }/statuses/${ commitSha }`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github.v3+json',
      authorization: `bearer ${ token }`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      state,
      target_url: targetUrl,
      description,
      context
    })
  }).then(response => {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request error (status ${ response.status })`);
    }
  });
}

function fetchStatusChecks({
  token, owner, repo, number
}) {
  return sendGraphqlRequest({
    token,
    query: `
      query {
        repository(owner: "${ owner }", name: "${ repo }") {
          pullRequest(number: ${ number }) {
            commits(last: 1) {
              nodes {
                commit {
                  oid
                  status {
                    contexts {
                      context
                      description
                      targetUrl
                      state
                    }
                  }
                }
              }
            }
          }
        }
      }
    `
  });
}

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = { token: '', pullRequestUrl: '' };
  }

  render() {
    return React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        null,
        'Generate a personal access token',
        ' ',
        React.createElement(
          'a',
          {
            href: 'https://github.com/settings/tokens',
            target: '_blank',
            rel: 'noopener noreferrer'
          },
          'here'
        ),
        ' ',
        'and enter it below.'
      ),
      React.createElement(
        'div',
        null,
        'For public repositories, the token should have ',
        React.createElement(
          'code',
          null,
          'repo:status'
        ),
        ' scope. For private repositories, the token should have ',
        React.createElement(
          'code',
          null,
          'repo'
        ),
        ' scope.'
      ),
      React.createElement('input', { type: 'password', value: this.state.token, onChange: event => this.setState({ token: event.target.value }) }),
      this.state.token && React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          null,
          'Enter the URL of a pull request on GitHub.'
        ),
        React.createElement('input', {
          type: 'text',
          value: this.state.pullRequestUrl,
          onChange: event => this.setState({ pullRequestUrl: event.target.value })
        })
      ),
      this.state.pullRequestUrl && React.createElement(
        'div',
        null,
        React.createElement(PullRequestDisplayWrapper, { url: this.state.pullRequestUrl, token: this.state.token })
      )
    );
  }
}

function PullRequestDisplayWrapper({ url, token }) {
  const match = url.match(/^https:\/\/github.com\/([\w-]+)\/([\w-]+)\/pull\/(\d+)/);

  if (match === null) {
    return React.createElement(
      'div',
      null,
      'Could not parse URL. Please enter a URL in the format https://github.com/owner/repo/pull/123.'
    );
  }
  const [, owner, repo, number] = match;
  return React.createElement(PullRequestDisplay, { owner: owner, repo: repo, number: number, token: token });
}

class PullRequestDisplay extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      isLoading: true,
      isErrored: false,
      commit: null,
      errorMessage: null,
      editingStatusContext: null,
      creatingNewStatus: false
    };

    this.fetchStatuses = requestInfo => {
      fetchStatusChecks(requestInfo).then(commit => this.setState({ isLoading: false, commit })).catch(err => this.setState({ isLoading: false, isErrored: true, errorMessage: err.message }));
    };
    this.fetchStatuses(props);
  }

  componentWillReceiveProps(props) {
    this.setState({ isLoading: true, isErrored: false, commit: null, errorMessage: null });
    this.fetchStatuses(props);
  }

  render() {
    if (this.state.isLoading) {
      return React.createElement(
        'div',
        null,
        'Loading...'
      );
    }
    if (this.state.isErrored) {
      return React.createElement(
        'div',
        null,
        'An error occurred when loading this PR: ',
        this.state.errorMessage,
        ' Does your token have sufficient scope?'
      );
    }

    return React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        null,
        'Status checks for this PR are listed below.',
        React.createElement(
          'ul',
          null,
          React.createElement(
            'li',
            null,
            'You can create or edit new status checks. All status checks that you update will be associated with your user account, and will display your user icon on GitHub.'
          ),
          React.createElement(
            'li',
            null,
            'You cannot delete a status check, or edit the ',
            React.createElement(
              'code',
              null,
              'context'
            ),
            ' field.'
          )
        )
      ),
      React.createElement(
        'table',
        null,
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            React.createElement(
              'th',
              null,
              'context'
            ),
            React.createElement(
              'th',
              null,
              'description'
            ),
            React.createElement(
              'th',
              null,
              'target url'
            ),
            React.createElement(
              'th',
              null,
              'status'
            ),
            React.createElement(
              'th',
              null,
              React.createElement(
                'button',
                { onClick: () => this.setState({ creatingNewStatus: true, editingStatusContext: null }) },
                'New'
              )
            )
          )
        ),
        React.createElement(
          'tbody',
          null,
          this.state.creatingNewStatus && React.createElement(EditableStatusCheckRow, {
            initialContext: '',
            initialDescription: '',
            initialTargetUrl: '',
            initialState: 'pending',
            contextEditable: true,
            submitEdits: ({ context, description, targetUrl, state }) => createStatus({
              token: this.props.token,
              owner: this.props.owner,
              repo: this.props.repo,
              commitSha: this.state.commit.oid,
              context,
              description,
              targetUrl,
              state
            }).then(() => this.setState(currentState => ({
              editingStatusContext: null,
              creatingNewStatus: false,
              commit: { ...currentState.commit,
                status: { ...currentState.commit.status,
                  contexts: [{ context, description, targetUrl, state }, ...currentState.commit.status.contexts]
                }
              }
            }))),
            cancelEdits: () => this.setState({ creatingNewStatus: false })
          }),
          (this.state.commit.status ? this.state.commit.status.contexts : []).map((status, index) => this.state.editingStatusContext === status.context ? React.createElement(EditableStatusCheckRow, {
            key: status.context,
            initialContext: status.context,
            initialDescription: status.description,
            initialTargetUrl: status.targetUrl,
            initialState: status.state,
            contextEditable: false,
            submitEdits: ({ description, targetUrl, state }) => createStatus({
              token: this.props.token,
              owner: this.props.owner,
              repo: this.props.repo,
              commitSha: this.state.commit.oid,
              context: status.context,
              description,
              targetUrl,
              state
            }).then(() => this.setState(currentState => ({
              editingStatusContext: null,
              creatingNewStatus: false,
              commit: { ...currentState.commit,
                status: { ...currentState.commit.status,
                  contexts: [...currentState.commit.status.contexts.slice(0, index), { context: status.context, description, targetUrl, state }, ...currentState.commit.status.contexts.slice(index + 1)]
                }
              }
            }))),
            cancelEdits: () => this.setState({ editingStatusContext: null, creatingNewStatus: false })
          }) : React.createElement(UneditableStatusCheckRow, _extends({
            key: status.context
          }, status, {
            startEditing: () => this.setState({ editingStatusContext: status.context, creatingNewStatus: false })
          })))
        )
      )
    );
  }
}

const STATUS_CHECK_STATES = [{ name: 'expected', selectable: false }, { name: 'error', selectable: true }, { name: 'failure', selectable: true }, { name: 'pending', selectable: true }, { name: 'success', selectable: true }];

function UneditableStatusCheckRow({ context, description, targetUrl, state, startEditing }) {
  return React.createElement(
    'tr',
    null,
    React.createElement(
      'td',
      null,
      context
    ),
    React.createElement(
      'td',
      null,
      description
    ),
    React.createElement(
      'td',
      null,
      targetUrl
    ),
    React.createElement(
      'td',
      null,
      STATUS_CHECK_STATES.map(({ name }) => React.createElement(
        'div',
        { key: name },
        React.createElement(
          'label',
          null,
          React.createElement('input', { type: 'radio', disabled: true, checked: state.toLowerCase() === name }),
          name
        )
      ))
    ),
    React.createElement(
      'td',
      null,
      React.createElement(
        'button',
        { onClick: startEditing },
        'Edit'
      )
    ),
    React.createElement('td', null)
  );
}

class EditableStatusCheckRow extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      context: props.initialContext || '',
      description: props.initialDescription || '',
      targetUrl: props.initialTargetUrl || '',
      state: props.initialState,
      hasSubmitError: false
    };
  }

  componentWillReceiveProps(props) {
    this.setState({
      context: props.initialContext || '',
      description: props.initialDescription || '',
      targetUrl: props.initialTargetUrl || '',
      state: props.initialState,
      hasSubmitError: false
    });
  }

  render() {
    return React.createElement(
      'tr',
      null,
      React.createElement(
        'td',
        null,
        this.props.contextEditable ? React.createElement('input', {
          type: 'text',
          value: this.state.context,
          onChange: event => this.setState({ context: event.target.value })
        }) : this.state.context
      ),
      React.createElement(
        'td',
        null,
        React.createElement('input', {
          type: 'text',
          value: this.state.description,
          onChange: event => this.setState({ description: event.target.value })
        })
      ),
      React.createElement(
        'td',
        null,
        React.createElement('input', {
          type: 'text',
          value: this.state.targetUrl,
          onChange: event => this.setState({ targetUrl: event.target.value })
        })
      ),
      React.createElement(
        'td',
        null,
        STATUS_CHECK_STATES.map(({ name, selectable }) => React.createElement(
          'div',
          { key: name },
          React.createElement(
            'label',
            null,
            React.createElement('input', {
              type: 'radio',
              disabled: !selectable,
              checked: this.state.state.toLowerCase() === name,
              onChange: () => this.setState({ state: name })
            }),
            name
          )
        ))
      ),
      React.createElement(
        'td',
        null,
        React.createElement(
          'button',
          {
            onClick: () => this.props.submitEdits({
              context: this.state.context,
              description: this.state.description,
              targetUrl: this.state.targetUrl,
              state: this.state.state
            }).catch(err => {
              this.setState({ hasSubmitError: true });
              throw err;
            })
          },
          this.state.hasSubmitError ? 'Error, click to try again' : 'Done'
        )
      ),
      React.createElement(
        'td',
        null,
        React.createElement(
          'button',
          { onClick: this.props.cancelEdits },
          'Cancel'
        )
      )
    );
  }
}

ReactDOM.render(React.createElement(App, null), document.getElementById('app'));
