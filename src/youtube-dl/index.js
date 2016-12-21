/**
 * youtube-dl wrapper. Provides platform-independent Promise API.
 * @module boram/youtube-dl
 */

import path from "path";
import which from "which";
import {APP_PATH} from "../shared";
import {makeRunner, getRunPath} from "../util";
require("file!../../bin/youtube-dl." + (BORAM_WIN_BUILD ? "exe" : "zip"));

export default makeRunner("youtube-dl", {
  _fixPathArgs(runpath, args) {
    if (BORAM_WIN_BUILD) {
      try {
        // youtube-dl lacks functionality without ffmpeg in PATH (can't
        // merge formats, embed subtitles, etc).
        which.sync("ffmpeg");
      } catch (e) {
        // "ffmpeg.exe" is in the same directory and "." is in PATH.
        runpath = path.join(APP_PATH, "youtube-dl");
      }
      return [runpath, args];
    } else if (runpath) {
      return [runpath, args];
    } else {
      // We might require youtube-dl package on Linux but it's often
      // outdated, so provide our own. On the other hand, Python should
      // be installed almost anywhere out of the box.
      const zippath = path.join(APP_PATH, "youtube-dl.zip");
      return [getRunPath("python"), [zippath].concat(args)];
    }
  },
  getInfo(url) {
    return this._run([
      "--no-playlist",
      "--dump-json",
      "--all-subs",
      "--",
      url,
    ]).then(JSON.parse);
  },
  download({url, format, outpath}, onUpdate) {
    const {vfid, afid, sfid} = format;
    const args = [
      "--no-part",
      "--no-playlist",
      "--format", vfid + (afid ? `+${afid}` : ""),
      "--merge-output-format", "mkv",
    ];
    if (sfid) {
      args.push(
        "--sub-lang", sfid,
        "--write-sub", "--embed-subs",
        "--postprocessor-args", "-c:s ass -disposition:s:0 default -f matroska"
      );
    }
    args.push("--output", outpath, "--", url);

    let log = "";
    let progress = 0;
    return this._run(args, (chunk) => {
      // Extract last printed line (status).
      chunk = chunk.toString();
      // console.log("@@@ IN", JSON.stringify(chunk));
      if (BORAM_WIN_BUILD) {
        chunk = chunk.replace(/\r\n/g, "\n");
      }
      const cr = chunk.lastIndexOf("\r");
      const nl = chunk.lastIndexOf("\n");
      const lastnl = Math.max(cr, nl);
      if (lastnl > -1) {
        let nextlastnl = -1;
        if (lastnl > 0) {
          const cr = chunk.lastIndexOf("\r", lastnl - 1);
          const nl = chunk.lastIndexOf("\n", lastnl - 1);
          nextlastnl = Math.max(cr, nl);
        }
        const status = nextlastnl > -1 ? chunk.slice(nextlastnl + 1, lastnl)
                                       : log + chunk.slice(0, lastnl);
        log = chunk.slice(lastnl + 1);
        const matched = status.match(/\s(\d+(\.\d+)?)%\s/);
        if (matched) {
          progress = parseFloat(matched[1]);
        }
        onUpdate({progress, status});
      } else {
        log += chunk;
      }
    });
  },
});
