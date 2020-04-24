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

var EventMetaType = {

};

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
        // 读取音频数据
        while (targetPos > reader.pos()) {
            event = {};
            event.dTime = reader.readVLQ();
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