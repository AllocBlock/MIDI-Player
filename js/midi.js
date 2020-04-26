const DEBUG_PRINT = false;

/* TODO: 事件类型枚举 */
var EventType = {
    NOTE_OFF : 0x80,
    NOTE_ON : 0x90,
    NOTE_AFTERTOUCH : 0xA0,
    CONTROL_CHANGE : 0xB0,
    PROGRAM_CHANGE : 0xC0, // 改变乐器？
    CHANNEL_PRESSURE : 0xD0,
    PITCH_WHEEL_CHANGE : 0xE0,
    SYSEX_OR_META_EVENT : 0xF0
};

/* TODO: 元事件 */
var EventMetaType = {
    SEQUENCE_NUMBER : 0x00,
    TEXT : 0x01,
    COPYRIGHT_NOTICE : 0x02,
    SEQUENCE_OR_TRACK_NAME : 0x03,
    INSTRUMENT_NAME : 0x04,
    LYRIC : 0x05,
    MARKER : 0x06,
    CUE_POINT : 0x07,
    MIDI_CHANNEL_PREFIX : 0x20,
    END_OF_TRACK : 0x2F,
    SET_TEMPO : 0x51, // FF 51 03 tttttt
    SMPTE_OFFSET : 0x54,
    TIME_SIGNATURE : 0x58,
    KEY_SIGNATURE : 0x59,
    SEQUENCER_SPECIFIC_META_EVENT : 0x7F,
};


/* 读取器，方便从ArrayBuffer里读取指定的数据 */
class Reader {
    constructor(binFile) {
        this.f = binFile;
        this.p = 0;
    }
    
    read(n) {
        var res = this.f.slice(this.p, this.p + n);
        this.p += n;
        return res;
    }

    readByte() {
        return this.read(1)[0];
    }

    readString(n) {
        var res = "";
        while(n--){
            res += String.fromCharCode(this.readByte());
        }
        return res;
    }

    readuInt16() {
        // 大端！
        var res = this.readByte();
        res <<= 8;
        res += this.readByte();
        return res;
    }

    readuInt24() {
        // 大端！
        var res = this.readByte();
        res <<= 8;
        res += this.readByte();
        res <<= 8;
        res += this.readByte();
        return res;
    }

    readuInt32() {
        // 大端！
        var res = this.readByte();
        res <<= 8;
        res += this.readByte();
        res <<= 8;
        res += this.readByte();
        res <<= 8;
        res += this.readByte();
        return res;
    }

    readVLQ() {
        // 动态字节 Variable Length Quantity
        // 大端！
        var res = 0;
        while (1) {
            var t = this.readByte();
            res = (res << 7) + (t & 0x7f);
            if (t < 0x80) {
                break;
            }
        }
       
        return res;
    }

    peek() {
        return this.f[this.p];
    }

    pos() {
        return this.p;
    }
};

/* midi播放器 */
class MidiPlayer{
    constructor(midi, audioSource) {
        this.midi = midi;
        this.audioSource = audioSource;
        this.cTime = 0;
        this.pEvent = [];
        this.timer = null; // 定时器
        this.isPlaying = false;
        for (var i = 0; i < this.midi.header.ntrack; i++){
            this.pEvent.push(0);
        }
        this.msPerTick = -1; // 不应该设为0，因为涉及除0的问题..
        this.bpm = 0;
    }

    runEvent(self, iTrack, iEvent){
        var e = self.midi.tracks[iTrack].events[iEvent];
        switch(e.method & 0xf0){
            case EventType.NOTE_OFF:{
                var tTrack = (e.method & 0x0f), note = e.param1, velocity = e.param2;
                //if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "松开音符", note, "力度", velocity);

                self.audioSource[note].volume = velocity / 255;
                if (!self.audioSource[note].paused){
                    self.audioSource[note].pause();
                    self.audioSource[note].currentTime = 0;
                }
                break;
            }
            case EventType.NOTE_ON:{
                var tTrack = (e.method & 0x0f), note = e.param1, velocity = e.param2;
                if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "按下音符", note, "力度", velocity);

                self.audioSource[note].volume = velocity / 255;
                if (self.audioSource[note].paused){
                    self.audioSource[note].play();
                }
                else{
                    self.audioSource[note].currentTime = 0;
                }
                break;
            }
            case EventType.NOTE_AFTERTOUCH:{
                var tTrack = (e.method & 0x0f), note = e.param1, velocity = e.param2;
                if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "Aftertouch音符", note, "力度: ", velocity, "（未处理）");
                break;
            }
            case EventType.CONTROL_CHANGE:{
                var tTrack = (e.method & 0x0f), controllerNumber = e.param1, newVal = e.param2;
                if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "控制器改变", controllerNumber, "新值", newVal, "（未处理）");
                break;
            }
            case EventType.PROGRAM_CHANGE:{
                var tTrack = (e.method & 0x0f), newProgramNumer = e.param1;
                if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "程序改变？ ", newProgramNumer, "（未处理）");
                break;
            }
            case EventType.CHANNEL_PRESSURE:{
                var tTrack = (e.method & 0x0f), pressureVal = e.param1;
                if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "声轨压力？ ", pressureVal, "（未处理）");
                break;
            }
            case EventType.PITCH_WHEEL_CHANGE:{
                var tTrack = (e.method & 0x0f), newVal = e.param1 << 7 + e.param2;
                if (DEBUG_PRINT) console.log("事件: 源自轨道[", iTrack, "]，轨道", tTrack, "弯音轮改变", newVal, "（未处理）");
                break;
            }
            case EventType.SYSEX_OR_META_EVENT:{
                if (e.method == 0xf0){ // 元事件
                    if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] sysex起始 长度", e.length, "数据", e.data);
                }
                else if (e.method == 0xf7){ // sysex起始
                    if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] sysex后续 长度", e.length, "数据", e.data);
                }
                else if (e.method == 0xff){ // 元事件
                    switch(e.metaType){
                        case EventMetaType.SEQUENCE_NUMBER:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 序列号（未处理）", e.data);
                            break;
                        }
                        case EventMetaType.TEXT:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 文本（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.COPYRIGHT_NOTICE:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 版权声明（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.SEQUENCE_OR_TRACK_NAME:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 序列/轨道名称（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.INSTRUMENT_NAME:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 乐器（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.LYRIC:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 歌词（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.MARKER:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 标记（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.CUE_POINT:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] CUE点（未处理）", String.fromCharCode.apply(null, e.data));
                            break;
                        }
                        case EventMetaType.MIDI_CHANNEL_PREFIX:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] MIDI声道前缀（未处理）", e.data);
                            break;
                        }
                        case EventMetaType.END_OF_TRACK:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 轨道结束（未处理）");
                            break;
                        }
                        case EventMetaType.SET_TEMPO:{
                            var division = self.midi.header.division;
                            var usPerTap = (e.data[0] << 16) + (e.data[1] << 8) + e.data[2];
                            if (division >> 7 == 0){ // tick模式
                                self.msPerTick = usPerTap / (division & 0x7f) / 1000;
                                self.bpm = 60000000 / usPerTap;
                            }
                            else{
                               throw("Midi文件为SYSEX格式，该格式的解析还未实现！");
                            }
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 改变节拍 msPerTick = ", self.msPerTick);
                            break;
                        }
                        case EventMetaType.SMPTE_OFFSET:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] SMPTE偏移量（未处理）", e.data);
                            break;
                        }
                        case EventMetaType.TIME_SIGNATURE:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 时间标记（未处理）", e.data);
                            break;
                        }
                        case EventMetaType.KEY_SIGNATURE:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 乐符标记（未处理）", e.data);
                            break;
                        }
                        case EventMetaType.SEQUENCER_SPECIFIC_META_EVENT:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] Sequencer Specific Meta-Event（未处理）", e.data);
                            break;
                        }
                        default:{
                            if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 未定义/未实现处理的 元事件", e.method, e.metaType);
                            break;
                        }
                    }
                }
                break;
            }
            default: {
                if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 未定义/未实现处理的 事件", e.method);
                break;
            }
        }
    }

    tick(self){
        var cTick = Math.floor(self.cTime / self.msPerTick);
        var isAllFinished = true;
        for (var i = 0; i < self.midi.header.ntrack; i++){
            var iTrack = i, iEvent = self.pEvent[i];

            var cEvent = self.midi.tracks[iTrack].events[iEvent];
            while(1){
                if (iEvent >= self.midi.tracks[iTrack].events.length) {
                    break;
                }
                if (cEvent.aTick > cTick) {
                    isAllFinished = false;
                    break;
                }
                self.runEvent(self, iTrack, iEvent);
                self.pEvent[i]++;
                iEvent++;
                cEvent = self.midi.tracks[i].events[iEvent];
            }
        }
        if (isAllFinished){ // 播放完毕
            if (DEBUG_PRINT) console.log("播放完毕");
            self.stop();
        }
        var cTime = Date.now();
        self.cTime += cTime - self.lastTime;
        self.lastTime = cTime;
    }

    getTime(){
        return this.cTime;
    }

    getTick(time){
        if (time == undefined){
            return Math.floor(this.cTime / this.msPerTick);
        }
        else{
            return Math.floor(time / this.msPerTick);
        }
    }

    getTickFloat(time){
        if (time == undefined){
            return this.cTime / this.msPerTick;
        }
        else{
            return time / this.msPerTick;
        }
    }

    getSection(time){
        if (time === undefined){
            return this.cTime / 60000 / (this.bpm * 4);
        }
        else{
            return time / 60000 / (this.bpm * 4);
        }
    }

    getTickBySection(section){
        if (this.bpm == 0){
            return null;
        }
        var sectionTime = section * 4 / this.bpm * 60000;
        var tick = sectionTime / this.msPerTick;
        return tick;
    }

    play(){
        if (!this.isPlaying){
            var timeout = 1; // 定时器延时
            this.lastTime = Date.now();
            this.isPlaying = true;
            this.timer = setInterval(this.tick, timeout, this);
        }
        
    }

    pause(){
        if (this.isPlaying){
            this.isPlaying = false;
            clearInterval(this.timer);
        }
    }

    stop(){
        this.pause();
        this.cTime = 0;
        this.pEvent = [];
        for (var i = 0; i < this.midi.header.ntrack; i++){
            this.pEvent.push(0);
        }
    }
}

/* 解析midi文件 */
function parseMidi(binFile) {
    var reader = new Reader(binFile);
    // 读取header
    var header = {};
    header.type = reader.readString(4);
    header.length = reader.readuInt32();
    header.format = reader.readuInt16();
    header.ntrack = reader.readuInt16();
    header.division = reader.readuInt16();

    if (header.type != "MThd"){
        return null;
    }

    var tracks = [];
    // 读取音频块
    for (var i = 0; i < header.ntrack; i++) {
        var track = {};
        // 音频块信息
        track.type = reader.readString(4);
        track.length = reader.readuInt32();
        track.events = [];


        if (track.type != "MTrk"){
            return null;
        }

        var targetPos = reader.pos() + track.length;
        var aTick = 0;
        // 读取音频数据
        while (targetPos > reader.pos()) {
            event = {};
            event.dTime = reader.readVLQ();
            event.aTick = aTick + event.dTime;
            aTick += event.dTime;
            event.method = reader.readByte();
            // AX，A指代动作，X表示目标轨道
            switch (event.method & 0xF0) {
                case EventType.NOTE_OFF: // 松开音符 | 音符号 力度
                case EventType.NOTE_ON: // 按下音符 | 音符号 力度
                case EventType.NOTE_AFTERTOUCH: // 触后音符 | 音符号 力度
                case EventType.CONTROL_CHANGE: // 控制器变化 | 控制器号码 控制器参数
                case EventType.PITCH_WHEEL_CHANGE: // 弯音轮变换 | 低字节 高字节
                {
                    event.param1 = reader.readByte();
                    event.param2 = reader.readByte();
                    break;
                }
                case EventType.PROGRAM_CHANGE: // 改变乐器 | 乐器号码
                case EventType.CHANNEL_PRESSURE: // 通道触动压力 | 压力大小
                {
                    event.param1 = reader.readByte();
                    break;
                }
                case EventType.SYSEX_OR_META_EVENT: // sysex event or meta event
                {
                    if (event.method == 0xf0 || event.method == 0xf7) { // sysex事件
                        event.length = reader.readVLQ(); // 长度
                        event.data = reader.read(event.length); // 数据
                    }
                    else if (event.method == 0xff) { // 元事件
                        event.metaType = reader.readByte(); // 种类

                        switch(event.metaType){
                            case EventMetaType.SEQUENCE_NUMBER: // FF 00 02 ssss
                            case EventMetaType.MIDI_CHANNEL_PREFIX: // FF 20 01 cc
                            case EventMetaType.END_OF_TRACK: // FF 2F 00
                            case EventMetaType.SET_TEMPO: // FF 51 03 tttttt
                            case EventMetaType.SMPTE_OFFSET: // FF 54 05 HR MN SE FR FF
                            case EventMetaType.TIME_SIGNATURE: // FF 58 04 nn dd cc bb
                            case EventMetaType.KEY_SIGNATURE:{ // FF 59 02 SD MI
                                event.length = reader.readByte();
                                if (event.length > 0)
                                    event.data = reader.read(event.length);
                                break;
                            }
                            case EventMetaType.TEXT: // FF 01 len text
                            case EventMetaType.COPYRIGHT_NOTICE: // FF 02 len text
                            case EventMetaType.SEQUENCE_OR_TRACK_NAME: // FF 03 len text
                            case EventMetaType.INSTRUMENT_NAME: // FF 04 len text
                            case EventMetaType.LYRIC: // FF 05 len text
                            case EventMetaType.MARKER: // FF 06 len text
                            case EventMetaType.CUE_POINT: // FF 07 len text
                            case EventMetaType.SEQUENCER_SPECIFIC_META_EVENT:{ // ff 7f len data
                                event.length = reader.readVLQ();
                                event.data = reader.read(event.length);
                                break;
                            }
                            default:{
                                if (DEBUG_PRINT) console.log("事件: 轨道[", iTrack, "] 未定义/未实现处理的 元事件 ", e.method, e.metaType);
                                break;
                            }
                        }
                    }
                    else{
                        return null;
                    }
                    break;
                }
                default:
                {
                    return null;
                }
            }
            track.events.push(event);
        }
        tracks.push(track);
    }
    

    var midi = {
        header: header,
        tracks: tracks
    }
    return midi;
}


