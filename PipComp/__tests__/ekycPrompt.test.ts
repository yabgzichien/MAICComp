import { parseIdentityExtraction, IdentityParseError } from '../src/llm/ekycPrompt';

describe('parseIdentityExtraction', () => {
  it('parses a well-formed IC extraction', () => {
    const r = parseIdentityExtraction('{"document_type":"ic","full_name":"AISYAH BINTI RAHMAN","id_number":"900115-10-5678"}');
    expect(r.docType).toBe('ic');
    expect(r.fullName).toBe('AISYAH BINTI RAHMAN');
    expect(r.idNumber).toBe('900115-10-5678');
  });

  it('tolerates a ```json fenced block', () => {
    const r = parseIdentityExtraction('```json\n{"document_type":"passport","full_name":"John Tan","id_number":"A12345678"}\n```');
    expect(r.docType).toBe('passport');
    expect(r.idNumber).toBe('A12345678');
  });

  it('normalises mykad to ic and unknown types', () => {
    expect(parseIdentityExtraction('{"document_type":"MyKad","full_name":"X","id_number":"1"}').docType).toBe('ic');
    expect(parseIdentityExtraction('{"document_type":"driver license","full_name":"X","id_number":"1"}').docType).toBe('unknown');
  });

  it('returns nulls for missing or blank fields', () => {
    const r = parseIdentityExtraction('{"document_type":"ic","full_name":"  ","id_number":null}');
    expect(r.fullName).toBeNull();
    expect(r.idNumber).toBeNull();
  });

  it('throws IdentityParseError on non-JSON', () => {
    expect(() => parseIdentityExtraction('not json at all')).toThrow(IdentityParseError);
  });
});
