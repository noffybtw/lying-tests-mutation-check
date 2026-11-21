# Tests that lie

Two tests for `toClientView` and `saveClient` stay green after `toClientView` stops returning `phone` and `saveClient` stops saving `name`. This repo shows why, rewrites the tests so that both bugs make them fail, and proves it with a mutation check.

## Why the original tests miss both bugs

They are in `test/old.test.js`, unchanged:

```js
it('returns correct shape', () => { expect(toClientView(c)).toEqual({ id: '1', name: 'A', phone: undefined }); });
it('saves client', async () => { await saveClient(c); expect(db.save).toHaveBeenCalled(); });
```

**returns correct shape**

- The fixture `c` has no phone, so the expected object can only say `phone: undefined`. A `toClientView` that drops `phone` returns the same thing, so the test can't tell copying the phone from losing it.
- `toEqual` treats a property set to `undefined` as equal to a missing one, so it doesn't notice that the `phone` key is gone either.

**saves client**

- `db.save` is a mock, and the test only checks that it was called, not what it was called with. A `saveClient` that leaves out `name` still calls it.
- Nothing is read back from storage, so the test never sees what was actually saved.

## The rewritten tests

`test/new.test.js`:

- The fixture has a distinct value for every field, phone included (a made-up number).
- Each expected object is written out in full and compared with `toStrictEqual`, which, unlike `toEqual`, tells a missing property from one set to `undefined`.
- `saveClient` takes the store as an optional second argument. The test passes an in-memory database (`src/db.js`), reads the record back and compares all of its fields.

## Mutation check

`npm run mutate` introduces each bug in a fresh copy of `src/` and `test/` in the system temp directory and runs both suites against it:

| Mutation | Original tests | New tests |
|---|---|---|
| A: `toClientView` without `phone` | 2/2 pass | 1/2 fail |
| B: `saveClient` without `name` | 2/2 pass | 1/2 fail |

![Console output of npm run mutate](docs/mutation-check.png)

[MUTATION.md](MUTATION.md) holds the full vitest output of the same run. The script rewrites it on every run and leaves its copies in the temp directory. It exits with code 1 if a mutation doesn't apply, if either suite fails on the unmodified code, or if a mutation leaves the new tests green or turns the original ones red.

## Running

Needs Node.js 22 (22.12 or later), 24, or 26 and up (the versions vitest 5 supports).

```sh
npm ci
npm test         # both suites on the unmodified code: 4/4 pass
npm run mutate   # mutations A and B; rewrites MUTATION.md
```

## The rule I give an agent

> For every test you write, break the code it covers and show me the test failing. A test that still passes on broken code doesn't count.
