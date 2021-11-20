const Msg = require('./core');

module.exports = class Invite extends Msg {
	checks () {
		if (this.isRetransmission()) return;
		console.debug(`#${this.meta.idx} INVITE Check ${this.meta.srcHost} -> ${this.meta.dstHost}`)
		this.checkCodecs();
		this.checkForTrying();
		this.checkForRinging();
		this.checkForReply();
//		this.checkForRelease();
	}
	
	checkForTrying() {
		const provReply = this.provisionalReply();
		if (provReply && provReply.length > 0) {
			this.facts.push({message: 'INVITE has a provisional reply'});
			this.facts.push({message: `INVITE <-> ACK (First Reply) Latency is ` + provReply[1].moment.diff(this.moment, 'milliseconds') + `ms`});
		} else {
			this.facts.push({message: 'INVITE does not have a provisional reply'});
		}
	}
	checkForRinging() {
		const ringing = this.searchReplies(true, msg => msg.sip.$ru == 183);
		var pdd = false;
		if (ringing.length) {
			console.log();
			this.facts.push({message: 'INVITE has ringing'});
			if (ringing[0].sip.body) {
				this.facts.push({message: '183 has an SDP Body'});
			} else {
				this.facts.push({message: '183 does not have an SDP Body'});
			}
			this.facts.push({message: 'INVITE has ringing'});
			
			pdd = ringing[0].moment.diff(this.moment, 'milliseconds')
		} else {
			this.facts.push({message: 'INVITE does not have ringing'});
		}

		const progressing = this.searchReplies(true, msg => msg.sip.$ru == 180);
		if (progressing.length) {
			this.facts.push({message: 'INVITE has progressing'});
			if (progressing[0].sip.body) {
				this.facts.push({message: '180 has an SDP Body'});
			} else {
				this.facts.push({message: '180 does not have an SDP Body'});
			}
			let newPdd = progressing[0].moment.diff(this.moment, 'milliseconds');
			if (pdd && newPdd < pdd) pdd = newPdd;
		} else {
			this.facts.push({message: 'INVITE does not have progressing'});
		}
		
		if (pdd) {
			this.facts.push({message: `INVITE PDD is ${pdd} ms`});
		} else {
			this.facts.push({message: `No session progress`});
		}
	}
	
	// checkForReply () {
		// const reply = this.reply();
		// if (reply) {
			// this.facts.push({message: 'INVITE has a final reply'});
		// } else {
			// this.facts.push({message: 'INVITE does not have a final reply'});
		// }
		
	// }
	checkForReply () {
		var reply = this.searchReplies(true, msg => {
			if (msg.isRetransmission()) return false;
			return msg.sip.$rd == 200
		})
		if (reply.length > 1) {
			this.facts.push({message: 'INVITE has more replies than expected'});
		} else if (!reply.length) {
			this.facts.push({message: 'INVITE call did not connect'});
		} else {
			this.facts.push({message: 'INVITE call connected'});
			// Connected
			this.checkReplyCodecs()
			this.checkRelease();
		}
	}
	
	checkRelease () {
		var bye = this.searchSequential(true, msg => {
			if (msg.isRetransmission()) return false;
			if (msg.sip.$rm != 'BYE') return false;
			if (this.meta.dstHost =! msg.meta.dstHost) return false
			return true
		})
		var ok200 = this.searchReplies(true, msg => {
			if (msg.isRetransmission()) return false;
			return msg.sip.$rd == 200
		})
		
		if (bye.length > 1) {
			this.facts.push({message: 'INVITE has more BYE messages than expected'});
		} else if (bye.length == 0) {
			this.facts.push({message: 'INVITE does not have any BYE message releasing the call'});
			return
		} else {
			this.facts.push({message: 'INVITE has a corrisponding BYE message'});
		}
		
		if (ok200.length > 0) {
			let ms = bye[0].moment.diff(ok200[0].moment);
			this.facts.push({message: `Call lasted ${ms}ms`});
		}
	}
	
	checkReplyCodecs () {
		var reply = this.searchReplies(true, msg => {
			if (msg.isRetransmission()) return false;
			return msg.sip.$rd == 200
		})
		if (!reply.length) return;

		var offerCodecs = this.codecs().map(codec => {
			if (codec.rtpmap) return codec.rtpmap;
			if (codec.name) return codec.name;
			return codec.id;
		});

		var replyCodecs = reply[0].codecs();
		
		replyCodecs.forEach(codec => {
			if (codec.rtpmap) {
				let match = offerCodecs.includes(codec.rtpmap);
				this.facts.push({message: `Reply Codec from SDP Body RTP Map: ${codec.rtpmap} - ${match ? 'Matched' : ''}`});
			} else if (codec.name) {
				let match = offerCodecs.includes(codec.name);
				this.facts.push({message: `Reply Codec from predefined RTP Map: ${codec.name} - ${match ? 'Matched' : ''}`});
			} else {
				let match = offerCodecs.includes(codec.id);
				this.facts.push({message: `Reply Unknown Codec: ${codec.id} - ${match ? 'Matched' : ''}`});
			}
		})
		
	}
	
	checkCodecs() {
		this.codecs().forEach(codec => {
			if (codec.rtpmap) {
				this.facts.push({message: `Codec from SDP Body RTP Map: ${codec.rtpmap}`});
			} else if (codec.name) {
				this.facts.push({message: `Codec from predefined RTP Map: ${codec.rtpmap}`});
			} else {
				this.facts.push({message: `Unknown Codec: ${codec.id}`});
			}
		})
	}
}