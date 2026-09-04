# Listening incident investigation

The archived request export contains twelve Music stream endpoint requests. For
the reported shared `naims` link on 2026-05-11, Android clients requested the
MP3 stream, while the iPhone client requested only the MP3 download URL. That
proves delivery was requested, but the old telemetry cannot prove that media
actually started, how long it played, or whether iOS suspended it in the
background. A stream URL request was therefore being over-interpreted as a
confirmed listen.

The player now records separate start, pause, 30-second progress, completion,
and error events with a playback session id, format, elapsed time, page, user
agent, and IP. Music events use a dedicated DynamoDB partition and are not
mixed with PortaPuter download events. This provides the missing evidence for
future investigations without treating a presigned-URL request as playback.
