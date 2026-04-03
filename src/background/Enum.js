class EnumOption
{
  constructor(name, value) {
    if (!Object.is(value, undefined)) {
      this.value = value;
    }

    this.symbol = Symbol.for(name);

    Object.freeze(this);
  }

  [Symbol.toPrimitive](hint) {
    return this.value;
  }

  toString() {
    return this.symbol;
  }

  valueOf() {
    return this.value;
  }

  toJSON() {
    return this.value;
  }
}

class Enum
{
  constructor(options) {
    for (let key in options) {
      this[key] = new EnumOption(key, options[key]);
    }

    Object.freeze(this);
  }

}

export default Enum;