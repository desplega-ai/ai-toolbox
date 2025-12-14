import { init, track as plausibleTrack } from '@plausible-analytics/tracker'

init({
  domain: 'willitfront.page',
  captureOnLocalhost: false,
})

export const track = {
  chatCreated: (model: string) => plausibleTrack('chat_created', { props: { model } }),
  messageSent: (model: string) => plausibleTrack('message_sent', { props: { model } }),
  ideaTesterSubmit: (type: string) => plausibleTrack('idea_tester_submit', { props: { type } }),
  tabCreated: (type: string) => plausibleTrack('tab_created', { props: { type } }),
  tabClosed: (type: string) => plausibleTrack('tab_closed', { props: { type } }),
  reset: (tabCount: number) => plausibleTrack('reset', { props: { tabCount: String(tabCount) } }),
}
