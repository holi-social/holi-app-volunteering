import http from 'k6/http'
import { check } from 'k6'

// You don't need to change anything in this section, it's k6 glue code.
// See the default function at the end of the file for defining your smoketest.
// This configuration only executes 1 test, enough for a smoketest. The smoketest will fail on any check failing.
const allChecksNeedToPassTreshold = { checks: [{ threshold: 'rate==1', abortOnFail: true }] }
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: allChecksNeedToPassTreshold,
}

/**
 * Performs a GraphQL query and checks the response using the provided function. Fails if any of the provided expectations are not met.
 * @param {string} query The GraphQL query to perform
 * @param {(response: http.Response) => Array<boolean>} checkFunction
 *   A function that takes the HTTP response as an argument and returns an array
 *   of boolean values, each indicating success or failure of a test.
 */
function forQuery(query, checkFunction) {
  const response = http.post(`${__ENV.BASE_URL}`, JSON.stringify({ query }), {
    headers: { 'Content-Type': 'application/json' },
  })
  checkFunction(response)
}

// Define your smoketest(s) here.
export default () => {
  forQuery(
    `engagementRecosV2(offset:0, limit:10, topics:["animal-welfare"]) {
    data {
      engagement {
        id
        title
        description
        topicsV2
        skillsV2
      }
      matchedTopics
      matchedSkills
    }
  }`,
    (response) => {
      check(response, {
        'is status 200': (r) => r.status === 200,
      })
      check(JSON.parse(response.body), {
        // there can be multiple tests here, e.g.
        //"contains topics object": (r) => typeof r.data.topics != null,
        'contains recos': (r) =>
          Array.isArray(r.data.engagementRecosV2.data) && r.data.engagementRecosV2.data.length > 0,
      })
    },
  )
}
