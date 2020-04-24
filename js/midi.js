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
    }

    runEvent(self, iTrack, iEvent){
        var e = self.midi.tracks[iTrack].events[iEvent];
        switch(e.method & 0xf0){
            case EventType.NOTE_OFF:{
                //console.log("event: track[", iTrack, "] stop note ", e.param1, ", veclocity: ", e.param2);

                var note = e.param1, velocity = e.param2;

                self.audioSource[note].volume = velocity / 255;
                if (!self.audioSource[note].paused){
                    self.audioSource[note].pause();
                    self.audioSource[note].currentTime = 0;
                }
                break;
            }
            case EventType.NOTE_ON:{
                console.log("event: track[", iTrack, "] play note ", e.param1, ", veclocity: ", e.param2);

                var note = e.param1, velocity = e.param2;

                self.audioSource[note].volume = velocity / 255;
                if (self.audioSource[note].paused){
                    self.audioSource[note].play();
                }
                else{
                    self.audioSource[note].currentTime = 0;
                }
                break;
            }
            case EventType.SYSEX_OR_META_EVENT:{
                if (e.method == 0xff){ // 元事件
                    switch(e.metaType){
                        case 0x51:{ // Tempo change
                            var division = self.midi.header.division;
                            var usPerTap = (e.data[0] << 16) + (e.data[1] << 8) + e.data[2];
                            if (division >> 7 == 0){ // tick模式
                                self.msPerTick = usPerTap / (division & 0x7f) / 1000;
                            }
                            else{
                               throw("SYSEX not supported yet");
                            }
                            console.log("event: track[", iTrack, "] change tempo, msPerTick = ", self.msPerTick);
                            break;
                        }
                    }
                }
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
                if (cEvent.aTime > cTick) {
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
            console.log("播放完毕");
            self.stop();
        }
        var cTime = Date.now();
        self.cTime += cTime - self.lastTime;
        self.lastTime = cTime;
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
        var aTime = 0;
        // 读取音频数据
        while (targetPos > reader.pos()) {
            event = {};
            event.dTime = reader.readVLQ();
            event.aTime = aTime + event.dTime;
            aTime += event.dTime;
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
                    if (event.method == 0xff) { // 元事件
                        event.metaType = reader.readByte(); // 种类
                        if (event.metaType == 0x00) { // 设置轨道音序，只有他数据长度字段是两字节，其他都是动态字节
                            event.length = reader.readuInt16();
                        }
                        else {
                            event.length = reader.readVLQ();
                        }
                        if (event.length > 0) { // 如果长度不为0
                            event.data = reader.read(event.length); // 数据
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


