#include <fstream>
#include <vector>
#include <iostream>
#include <iomanip>

namespace MIDI {

    enum MIDIResult {
        SUCCESS = 0x00,
        FAIL_OPEN_FILE = 0x01,
        FAIL_PARSE_FILE = 0x02
    };

    class Header
    {
    public:
        char type[4]; // MThd
        uint32_t length; // header数据长度，即6字节
        uint16_t format; // midi的类型，0代表单轨多声道，1代表同步多轨多声道，2代表顺序多轨（相当于多个独立单轨？）多声道
        uint16_t ntrack; // 轨道数量
        uint16_t division; // 时间格式，最高位为0代表tick计时，剩下的位表示一个四分音符持续的ticks数；最高位为1代表SMPTE计时，高7位用负数表示SMPTE标准，低8位表示每一帧所占的ticks数
    };

    enum EventType {
        NOTE_OFF = 0x80,
        NOTE_ON = 0x90,
        NOTE_AFTERTOUCH = 0xA0,
        CONTROL_CHANGE = 0xB0,
        PROGRAM_CHANGE = 0xC0, // 改变乐器？
        CHANNEL_PRESSURE = 0xD0,
        PITCH_WHEEL_CHANGE = 0xE0,
        SYSEX_OR_META_EVENT = 0xF0
    };

    enum EventMetaType {

    };

    class Event
    {
    public:
        uint64_t dTime;
        char method;
        EventType eventType;
    };

    class EventMidi : public Event {
    public:
        char param1, param2;
    };

    class EventSysex : public Event {
    public:
        char param1, param2;
    };

    class EventMeta : public Event {
    public:
        EventMetaType type;
        uint64_t length;
        std::vector<char> data;
    };

    struct Track
    {
        char type[4]; // MThd
        uint32_t length; // header数据长度，即6字节
        std::vector<Event*> events;
    };

    class FileReader {
    private:
        std::fstream f;
    public:
        void open(std::string fileName, int openmode) {
            f.open(fileName.c_str(), openmode);
        }

        void close() {
            f.close();
        }

        
        void read(char* mem, int num) {
            f.read(mem, num);
        }

        char readChar() {
            char res;
            f.read(&res, 1);
            return res;
        }

        char peek() {
            char res = f.peek();
            return res;
        }

        uint16_t readuInt16() {
            // 大端！
            uint16_t res;
            f.read((char*)&res + 1, 1);
            f.read((char*)&res, 1);
            return res;
        }

        uint32_t readuInt32() {
            // 大端！
            uint32_t res;
            f.read((char*)&res + 3, 1);
            f.read((char*)&res + 2, 1);
            f.read((char*)&res + 1, 1);
            f.read((char*)&res, 1);
            return res;
        }

        uint64_t readVLQ() {
            // 动态字节 Variable Length Quantity
            // 大端！
            uint64_t res = 0;
            char t;
            while (1) {
                f.read(&t, 1);
                res = (res << 7) + (t & 0x7f);
                if (t >= 0 || f.eof()) {
                    break;
                }
            }
           
            return res;
        }

        std::streampos tellg() {
            return f.tellg();
        }


        bool is_open() {
            return f.is_open();
        }

        bool eof() {
            return f.eof();
        }
    };

    std::string charToEventName(char eventType) {
        switch (eventType & 0xf0)
        {
        case NOTE_OFF:
            return "NOTE_OFF";
        case NOTE_ON:
            return "NOTE_ON";
        case NOTE_AFTERTOUCH:
            return "NOTE_AFTERTOUCH";
        case CONTROL_CHANGE:
            return "CONTROL_CHANGE";
        case PROGRAM_CHANGE:
            return "PROGRAM_CHANGE";
        case CHANNEL_PRESSURE:
            return "CHANNEL_PRESSURE";
        case PITCH_WHEEL_CHANGE:
            return "PITCH_WHEEL_CHANGE";
        case SYSEX_OR_META_EVENT:
            return "SYSEX_OR_META_EVENT";
        default:
            return "EVENT_NOT_FOUND";
        }

    }

    class Midi {
    private:
        std::string fileName;
        Header header;
        std::vector<Track> tracks;
    public:
        MIDIResult parse(std::string fileName) {
            this->fileName = fileName;
            // 打开文件
            FileReader f;
            f.open(fileName, std::ios::in | std::ios::binary);
            if (!f.is_open()) {
                return MIDIResult::FAIL_OPEN_FILE;
            }
            // 读取header
            f.read(header.type, 4);
            header.length = f.readuInt32();
            header.format = f.readuInt16();
            header.ntrack = f.readuInt16();
            header.division = f.readuInt16();

            // 读取音频块
            for (int i = 0; i < (int)header.ntrack; i++) {
                Track track;
                // 音频块信息
                f.read(track.type, 4);
                track.length = f.readuInt32();
                std::streampos target = f.tellg() + (std::streampos)track.length;
                // 读取音频数据
                while (target > f.tellg()) {
                    /*if (f.eof()) {
                        break;
                    }*/
                    
                    uint64_t dTime = f.readVLQ();
                    char method = f.readChar();
                    // AX，A指代动作，X表示目标轨道
                    switch (method & 0xF0)
                    {
                    case NOTE_OFF: // 松开音符 | 音符号 力度
                    case NOTE_ON: // 按下音符 | 音符号 力度
                    case NOTE_AFTERTOUCH: // 触后音符 | 音符号 力度
                    case CONTROL_CHANGE: // 控制器变化 | 控制器号码 控制器参数
                    case PITCH_WHEEL_CHANGE: // 弯音轮变换 | 低字节 高字节
                    {
                        char param1, param2;
                        param1 = f.readChar();
                        param2 = f.readChar();

                        EventMidi* event = new EventMidi();
                        event->dTime = dTime;
                        event->method = method;
                        event->param1 = param1;
                        event->param2 = param2;

                        track.events.push_back(event);
                        break;
                    }
                    case PROGRAM_CHANGE: // 改变乐器 | 乐器号码
                    case CHANNEL_PRESSURE: // 通道触动压力 | 压力大小
                    {
                        char param1;
                        param1 = f.readChar();

                        EventMidi* event = new EventMidi();
                        event->dTime = dTime;
                        event->method = method;
                        event->param1 = param1;

                        track.events.push_back(event);
                        break;
                    }
                    case SYSEX_OR_META_EVENT: // sysex event or meta event
                    {
                        if (method == (char)0xff) { // 元事件
                            
                            EventMetaType type = (EventMetaType)f.readChar(); // 种类
                            uint64_t length; // 数据长度
                            if (type == 0x00) { // 设置轨道音序，只有他数据长度字段是两字节，其他都是动态字节
                                length = (uint64_t)f.readuInt16();
                            }
                            else {
                                length = f.readVLQ();
                            }
                            char* data = new char[length];
                            if (length > 0) { // 如果长度不为0
                                f.read(data, length); // 数据
                            }

                            EventMeta* event = new EventMeta();
                            event->dTime = dTime;
                            event->method = method;
                            event->type = type;
                            event->length = length;
                            for (int j = 0; j < length; j++)
                                event->data.push_back(data[j]);

                            track.events.push_back(event);
                        }
                        break;
                    }
                    default:
                    {
                        throw "type not found";
                        break;
                    }
                    }
                    

                    
                }
                tracks.push_back(track);
            }

            // 关闭文件
            f.close();
        }

        char decToHex(int n) {
            n = n % 16;
            switch (n)
            {
            case 0:
                return '0';
            case 1:
                return '1';
            case 2:
                return '2';
            case 3:
                return '3';
            case 4:
                return '4';
            case 5:
                return '5';
            case 6:
                return '6';
            case 7:
                return '7';
            case 8:
                return '8';
            case 9:
                return '9';
            case 10:
                return 'A';
            case 11:
                return 'B';
            case 12:
                return 'C';
            case 13:
                return 'D';
            case 14:
                return 'E';
            case 15:
                return 'F';
            default:
                return 'X';
            }
        }

        std::string charToHex(char n) {
            std::string res;
            if (n > 0) res = "0";
            else {
                res = decToHex((unsigned char)n >> 4);
            }
            res += decToHex(n & 0x0f);
            return res;
        }

        void print() {
            // 头部
            std::cout << "midi文件：" << fileName << std::endl;
            std::cout << "头部" << std::endl;
            std::cout << "\t类型：" << header.type[0] << header.type[1] << header.type[2] << header.type[3] << std::endl;
            std::cout << "\t长度：" << header.length << std::endl;
            std::cout << "\t格式：" << (header.format == 0 ? "单轨多声道" : (header.format == 1 ? "同步多轨多声道" : "顺序多轨多声道")) << std::endl;
            std::cout << "\t轨道数量：" << header.ntrack << std::endl;
            std::cout << "\t细分方式：" << ((header.division & 0x80) == 0 ? "tick" : "SMPTE") << std::endl;
            // 音频块
            std::cout << "音频块：" << std::endl;
            for (int i = 0; i < tracks.size(); i++) {
                std::cout << "音频块[" << i+1 << "]" << std::endl;
                Track &track = tracks[i];
                // 音频块信息
                std::cout << "\t类型：" << track.type[0] << track.type[1] << track.type[2] << track.type[3] << std::endl;
                std::cout << "\t长度：" << track.length << std::endl;
                // 音频数据
                std::cout << "\t事件：" << std::endl;
                for (int j = 0; j < track.events.size(); j++) {
                    Event* event = track.events[j];
                    std::cout << "\t\t时间：" << std::setw(4) << event->dTime;
                    std::cout << "\t方法：" << charToEventName(event->method);
                    std::cout << "\t参数：";
                    switch (event->method & 0xF0)
                    {
                    case NOTE_OFF: // 松开音符 | 音符号 力度
                    case NOTE_ON: // 按下音符 | 音符号 力度
                    case NOTE_AFTERTOUCH: // 触后音符 | 音符号 力度
                    case CONTROL_CHANGE: // 控制器变化 | 控制器号码 控制器参数
                    case PITCH_WHEEL_CHANGE: // 弯音轮变换 | 低字节 高字节
                    {
                        std::cout << charToHex(((EventMidi*)event)->param1) << " " << charToHex(((EventMidi*)event)->param2);
                        break;
                    }
                    case PROGRAM_CHANGE: // 改变乐器 | 乐器号码
                    case CHANNEL_PRESSURE: // 通道触动压力 | 压力大小
                    {
                        std::cout << charToHex(((EventMidi*)event)->param1);
                        break;
                    }
                    case SYSEX_OR_META_EVENT: // sysex event or meta event
                    {
                        if (event->method == (char)0xff) { // 元事件
                            std::cout << "类型：" << charToHex(((EventMeta*)event)->type)<< " " << "长度：" << ((EventMeta*)event)->length;
                        }
                        break;
                    }
                    default:
                    {
                        throw "type not found";
                        break;
                    }
                    }
                    std::cout << std::endl;
                }
            }
        }
    };
}
