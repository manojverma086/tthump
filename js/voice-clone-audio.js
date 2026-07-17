/* Audio helpers for story playback duration checks */
(function (global) {
  "use strict";

  async function getBlobDurationSec(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return audioBuffer.duration;
  }

  global.TapRoarVoiceAudio = {
    getBlobDurationSec
  };
})(window);
