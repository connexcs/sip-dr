const sip_parsing = require('sip-parsing');
const moment = require('moment');
const rtpMap = require('../rtpmap.json');

module.exports = class Msg {
	constructor (sip, prev = null, meta = {}) {
		this.sip = sip
		this.msg = sip.str;
		this.prev = prev;
		this.meta = meta;
		this.next = null;
		this.facts = [];
		if (meta.unix) {
			this.moment = moment.unix(meta.unix);
		} else {
			this.moment = moment([meta.year, meta.month, meta.day, meta.hour, meta.minute, meta.second, meta.microsecond / 1000]);
		}
	}

	header (name) {
		return this.sip[name];
	}
	
	isRequest () {
		/* https://tools.ietf.org/html/rfc3261#section-7.1 */
		return ['INVITE', 'BYE', 'REGISTER', 'INFO', 'SUBSCRIBE', 'OPTIONS', 'MESSAGE', 'NOTIFY', 'CANCEL', 'UPDATE', 'PRACK', 'ACK', 'REFER', 'PUBLISH'].includes(this.sip.$rm)
	}
	
	isReply () {
		return !isNaN(this.sip.$rr)
	}
	
	isRetransmission () {
		return !!this.searchForMsg(false, msg => msg.sip.str == this.sip.str)
	}
	
	getRequest () {
		if (this.isRequest()) throw new Error ('This message is a request');
		return this.searchForMsg(false, msg => msg.sip['$hdr(cseq)'] == this.sip['$hdr(cseq)'] && msg.isRequest())
	}
	
	provisionalReply () {
		if (this.isReply()) throw new Error ('This message is a reply');
		return this.searchReplies(true, msg => msg.sip.$ru == 100);
	}
	
	reply () {
		if (this.isReply()) throw new Error ('This message is a reply');
		var result = this.searchReplies(true, msg => {
			return msg.sip.$ru > 100 && !msg.isRetransmission();
		});
		return result;
	}
	
	parse () {
		var msg = this.msg.replace(/\n/g, "\r\n");
		return sip_parsing.parse(msg);
	}
	
	searchForMsg(forwards = true, checkerFn) {
		var next = forwards ? this.next : this.prev
		if (!next) return false;
		if (checkerFn(next)) return next;
		return next.searchForMsg(forwards, checkerFn);
	}
	
	search (forwards = true, checkerFn) {
		var next = forwards ? this.next : this.prev
		if (!next) return [];
		var result = []
		if (checkerFn(next)) result.push(next);
		result.push(...next.search(forwards, checkerFn));
		return result;
	}
	
	searchReplies(forwards = true, checkerFn) {
		const thisCallID = this.sip.headers.find(row => row[0] === 'call-id')[1];
		return this.search(forwards, msg => {
			if (msg.sip['$hdr(cseq)'] != this.sip['$hdr(cseq)']) return false;
			const msgCallID = msg.sip.headers.find(row => row[0] == 'call-id')[1];
			if (msgCallID != thisCallID) return false
			if (msg.meta.dstHost != this.meta.srcHost) return false;
			//if (msg.meta.dstHost != this.meta.dstHost) return false;
			return checkerFn(msg);
		})
	}
	
	searchSequential (forwards, checkerFn) {
		const thisCallID = this.sip.headers.find(row => row[0] === 'call-id')[1];
		return this.search(forwards, msg => {
			const msgCallID = msg.sip.headers.find(row => row[0] == 'call-id')[1];
			if (msgCallID != thisCallID) return false
			
			if (msg.meta.srcHost == this.meta.srcHost && msg.meta.dstHost == this.meta.dstHost) {
				// [REQUEST]
			} else if (msg.meta.dstHost == this.meta.srcHost){
				// [REPLY]
			} else {
				return false;
			}
			
			return checkerFn(msg);
		})
	}
	
	print () {
		console.log(`#${this.meta.idx}: ${this.meta.srcHost} -> ${this.meta.dstHost} : ${this.sip.first_line}`);
	}
	
	checks () {
//		console.debug('Core Check')
	}
	
	checkMTU () {
		// Need to check for isUDP
		if (this.msg.length > 1499) {
			return { status: 'error', message: 'Maximum Transmission Unit Exceeded (UDP Payload Size Too Large)' };
		} else if (this.msg.length > 1400) {
			return { status: 'warning', message: 'UDP Payload Size Warning' };
		}	
	}
	
	codecs () {
		var result = [];
		const regex = /m\=audio (\d+) RTP\/AVP (.*)/;
		regex.exec(this.sip.body)[2].split(' ').forEach(id => {
			let found = false;
			this.sip.body.split('\r\n').forEach(line => {
				if (line.startsWith('a=rtpmap:' + id)) {
					found = true;
					result.push({rtpmap: line.substr(('a=rtpmap:' + id).length + 1)});
				}
			})
			if (!found) {
				if (rtpMap[id]) {
					result.push(rtpMap[id]);
				} else {
					result.push({ id });
				}
			}
		})
		return result;
	}
}