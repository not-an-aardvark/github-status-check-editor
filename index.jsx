function sendGraphqlRequest({ token, query }) {
  return fetch(
    'https://api.github.com/graphql',
    {
      method: 'POST',
      headers: {
        authorization: `bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  ).then((response) => {
    if (response.status >= 200 && response.status < 300) {
      return response.json();
    }
    throw new Error(`Request error (status ${response.status})`);
  }).then(({ data: { repository: { pullRequest: { commits: { nodes: [{ commit }] } } } } }) => commit);
}

function createStatus({
  token, owner, repo, commitSha, context, description, targetUrl, state,
}) {
  return fetch(
    `https://api.github.com/repos/${owner}/${repo}/statuses/${commitSha}`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github.v3+json',
        authorization: `bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state,
        target_url: targetUrl,
        description,
        context,
      }),
    },
  ).then((response) => {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Request error (status ${response.status})`);
    }
  });
}

function fetchStatusChecks({
  token, owner, repo, number,
}) {
  return sendGraphqlRequest({
    token,
    query: `
      query {
        repository(owner: "${owner}", name: "${repo}") {
          pullRequest(number: ${number}) {
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
    `,
  });
}

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = { token: '', pullRequestUrl: '' };
  }

  render() {
    return (
      <div>
        <div>
          Generate a personal access token{' '}
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
          >
            here
          </a>
          {' '}and enter it below.
        </div>
        <div>For public repositories, the token should have <code>repo:status</code> scope. For private repositories, the token should have <code>repo</code> scope.</div>
        <input type="password" value={this.state.token} onChange={event => this.setState({ token: event.target.value })} />
        {
          this.state.token &&
          <div>
            <div>Enter the URL of a pull request on GitHub.</div>
            <input
              type="text"
              value={this.state.pullRequestUrl}
              onChange={event => this.setState({ pullRequestUrl: event.target.value })}
            />
          </div>
        }
        {
          this.state.pullRequestUrl &&
          <div>
            <PullRequestDisplayWrapper url={this.state.pullRequestUrl} token={this.state.token} />
          </div>
        }
      </div>
    );
  }
}

function PullRequestDisplayWrapper({ url, token }) {
  const match = url.match(/^https:\/\/github.com\/([\w-]+)\/([\w-]+)\/pull\/(\d+)/);

  if (match === null) {
    return <div>Could not parse URL. Please enter a URL in the format https://github.com/owner/repo/pull/123.</div>;
  }
  const [, owner, repo, number] = match;
  return <PullRequestDisplay owner={owner} repo={repo} number={number} token={token} />;
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
      creatingNewStatus: false,
    };

    this.fetchStatuses = (requestInfo) => {
      fetchStatusChecks(requestInfo)
        .then(commit => this.setState({ isLoading: false, commit }))
        .catch(err => this.setState({ isLoading: false, isErrored: true, errorMessage: err.message }));
    };
    this.fetchStatuses(props);
  }

  componentWillReceiveProps(props) {
    this.setState({ isLoading: true, isErrored: false, commit: null, errorMessage: null });
    this.fetchStatuses(props);
  }

  render() {
    if (this.state.isLoading) {
      return <div>Loading...</div>;
    }
    if (this.state.isErrored) {
      return (
        <div>
          An error occurred when loading this PR: {this.state.errorMessage} Does your token have sufficient scope?
        </div>
      );
    }

    return (
      <div>
        <div>
        Status checks for this PR are listed below.
          <ul>
            <li>You can create or edit new status checks. All status checks that you update will be associated with your user account, and will display your user icon on GitHub.</li>
            <li>You cannot delete a status check, or edit the <code>context</code> field.</li>
          </ul>
        </div>
        <table>
          <thead>
            <tr>
              <th>context</th>
              <th>description</th>
              <th>target url</th>
              <th>status</th>
              <th>
                <button onClick={() => this.setState({ creatingNewStatus: true, editingStatusContext: null })}>
                New
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {
              this.state.creatingNewStatus && <EditableStatusCheckRow
                initialContext=""
                initialDescription=""
                initialTargetUrl=""
                initialState="pending"
                contextEditable
                submitEdits={
                  ({ context, description, targetUrl, state }) =>
                    createStatus({
                      token: this.props.token,
                      owner: this.props.owner,
                      repo: this.props.repo,
                      commitSha: this.state.commit.oid,
                      context,
                      description,
                      targetUrl,
                      state,
                    }).then(
                      () =>
                        this.setState(currentState => ({
                          editingStatusContext: null,
                          creatingNewStatus: false,
                          commit: {
                            ...currentState.commit,
                            status: {
                              ...currentState.commit.status,
                              contexts: [
                                { context, description, targetUrl, state },
                                ...currentState.commit.status.contexts,
                              ],
                            },
                          },
                        })),
                    )
                }
                cancelEdits={() => this.setState({ creatingNewStatus: false })}
              />
            }
            {
              (this.state.commit.status ? this.state.commit.status.contexts : []).map((status, index) => (
                this.state.editingStatusContext === status.context
                  ? <EditableStatusCheckRow
                    key={status.context}
                    initialContext={status.context}
                    initialDescription={status.description}
                    initialTargetUrl={status.targetUrl}
                    initialState={status.state}
                    contextEditable={false}
                    submitEdits={
                      ({ description, targetUrl, state }) =>
                        createStatus({
                          token: this.props.token,
                          owner: this.props.owner,
                          repo: this.props.repo,
                          commitSha: this.state.commit.oid,
                          context: status.context,
                          description,
                          targetUrl,
                          state,
                        }).then(
                          () =>
                            this.setState(currentState => ({
                              editingStatusContext: null,
                              creatingNewStatus: false,
                              commit: {
                                ...currentState.commit,
                                status: {
                                  ...currentState.commit.status,
                                  contexts: [
                                    ...currentState.commit.status.contexts.slice(0, index),
                                    { context: status.context, description, targetUrl, state },
                                    ...currentState.commit.status.contexts.slice(index + 1),
                                  ],
                                },
                              },
                            })),
                        )
                    }
                    cancelEdits={() => this.setState({ editingStatusContext: null, creatingNewStatus: false })}
                  />
                  : <UneditableStatusCheckRow
                    key={status.context}
                    {...status}
                    startEditing={() => this.setState({ editingStatusContext: status.context, creatingNewStatus: false })}
                  />
              ))
            }
          </tbody>
        </table>
      </div>
    );
  }
}

const STATUS_CHECK_STATES = [
  { name: 'expected', selectable: false },
  { name: 'error', selectable: true },
  { name: 'failure', selectable: true },
  { name: 'pending', selectable: true },
  { name: 'success', selectable: true },
];

function UneditableStatusCheckRow({ context, description, targetUrl, state, startEditing }) {
  return (
    <tr>
      <td>{context}</td>
      <td>{description}</td>
      <td>{targetUrl}</td>
      <td>
        {
          STATUS_CHECK_STATES.map(({ name }) => (
            <div key={name}>
              <label>
                <input type="radio" disabled checked={state.toLowerCase() === name} />
                {name}
              </label>
            </div>
          ))
        }
      </td>
      <td>
        <button onClick={startEditing}>
          Edit
        </button>
      </td>
      <td />
    </tr>
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
      hasSubmitError: false,
    };
  }

  componentWillReceiveProps(props) {
    this.setState({
      context: props.initialContext || '',
      description: props.initialDescription || '',
      targetUrl: props.initialTargetUrl || '',
      state: props.initialState,
      hasSubmitError: false,
    });
  }

  render() {
    return (
      <tr>
        <td>
          {
            this.props.contextEditable
              ? <input
                type="text"
                value={this.state.context}
                onChange={event => this.setState({ context: event.target.value })}
              />
              : this.state.context
          }
        </td>
        <td>
          <input
            type="text"
            value={this.state.description}
            onChange={event => this.setState({ description: event.target.value })}
          />
        </td>
        <td>
          <input
            type="text"
            value={this.state.targetUrl}
            onChange={event => this.setState({ targetUrl: event.target.value })}
          />
        </td>
        <td>
          {
            STATUS_CHECK_STATES.map(({ name, selectable }) => (
              <div key={name}>
                <label>
                  <input
                    type="radio"
                    disabled={!selectable}
                    checked={this.state.state.toLowerCase() === name}
                    onChange={() => this.setState({ state: name })}
                  />
                  {name}
                </label>
              </div>
            ))
          }
        </td>
        <td>
          <button
            onClick={
              () =>
                this.props.submitEdits({
                  context: this.state.context,
                  description: this.state.description,
                  targetUrl: this.state.targetUrl,
                  state: this.state.state,
                }).catch((err) => {
                  this.setState({ hasSubmitError: true });
                  throw err;
                })
            }
          >
            {this.state.hasSubmitError ? 'Error, click to try again' : 'Done'}
          </button>
        </td>
        <td>
          <button onClick={this.props.cancelEdits}>Cancel</button>
        </td>
      </tr>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('app'));
