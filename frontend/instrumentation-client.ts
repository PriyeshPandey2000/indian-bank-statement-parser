import posthog from 'posthog-js'

posthog.init('phc_D6wnkSX6eHkB3AvPmjL5P7TchG6srhgAN5doLC3J6aJs', {
  api_host: 'https://us.i.posthog.com',
  defaults: '2026-05-30',
})

export function onRouterTransitionStart(url: string) {
  posthog.capture('$pageview', { $current_url: url })
}
