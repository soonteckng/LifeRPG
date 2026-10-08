exports.motionApi = (React, host) => {
 const events=[],values=[];
 const target = animation => typeof animation==='number'?animation:animation.toValue??(animation.kind==='sequence'?target(animation.items.at(-1)):target(animation.animation));
 return {events,values,api:{__esModule:true,default:{View:host('Animated')},
  useSharedValue:initial=>React.useState(()=>{const value={current:initial,get(){return this.current;},set(next){this.current=target(next);events.push({kind:'set',value,next});}};values.push(value);return value;})[0],
  useAnimatedStyle:callback=>callback(),cancelAnimation:value=>events.push({kind:'cancel',value}),
  withTiming:(toValue,config)=>({kind:'timing',toValue,config}),withDelay:(delay,animation)=>({kind:'delay',delay,animation}),
  withSequence:(...items)=>({kind:'sequence',items}),withRepeat:(animation,count,reverse)=>{const value={kind:'repeat',animation,count,reverse};events.push(value);return value;},
  interpolate:(value,input,output)=>value<=input[0]?output[0]:value>=input.at(-1)?output.at(-1):output[0]+(output.at(-1)-output[0])*(value-input[0])/(input.at(-1)-input[0]),
  Easing:{sin:'sin',inOut:value=>value},
 }};
};
